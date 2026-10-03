/**
 * Task 04 — tenant access (the one enforcement function).
 *
 * The `restaurants` row in the main Postgres database is the single source of
 * truth for a tenant's lifecycle. Supabase (`restaurants_cloud`), `license.lic`
 * and the HQ client are NOT sources for this status and must never write it.
 *
 * Access is DERIVED ON READ from the stored status plus the two date columns that
 * already exist (`trial_ends_at`, `subscription_expires_at`). There is no cron and
 * no background job: a tenant that never logs in simply never transitions, and
 * the moment it does log in the correct mode is computed.
 *
 * Lifecycle:
 *   TRIAL / PENDING_REVIEW / ACTIVE  FULL until their end date
 *   end date passed, + GRACE_DAYS      GRACE   -> FULL with a warning
 *   grace exhausted                    SUSPENDED -> READ_ONLY (reads only)
 *   is_active = false                 BLOCKED (platform suspend, emergency)
 *
 * Reads are never rejected here: READ_ONLY is a mode, not an error. Only BLOCKED
 * may reject a request, and the call sites own that decision.
 */
import type { SubscriptionStatus } from '@prisma/client';

export type TenantAccessMode = 'FULL' | 'READ_ONLY' | 'BLOCKED';

export const TENANT_ACCESS_BLOCKED_CODE = 'TENANT_BLOCKED';

/** Default grace length after a period/trial end date. */
export const GRACE_DAYS = 5;
/** Default trial length for a tenant provisioned as TRIAL. */
export const TRIAL_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * GRACE_DAYS is a constant with an env override so an operator can widen the
 * grace window per deployment without a code change. An unusable value falls back
 * to the default rather than silently disabling grace.
 */
export function getGraceDays(): number {
    const raw = process.env.TENANT_GRACE_DAYS;
    if (raw === undefined || raw.trim() === '') return GRACE_DAYS;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return GRACE_DAYS;
    return Math.floor(parsed);
}

export function getTrialDays(): number {
    const raw = process.env.TENANT_TRIAL_DAYS;
    if (raw === undefined || raw.trim() === '') return TRIAL_DAYS;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return TRIAL_DAYS;
    return Math.floor(parsed);
}

/** The only columns the derivation needs. */
export interface TenantAccessRow {
    is_active: boolean;
    subscription_status: SubscriptionStatus;
    trial_ends_at: Date | null;
    subscription_expires_at: Date | null;
}

export interface TenantAccess {
    /** What the tenant may do right now. */
    mode: TenantAccessMode;
    /** The status as stored in the restaurants row. */
    status: SubscriptionStatus;
    /** The status after dates are applied; differs from `status` inside grace. */
    effectiveStatus: SubscriptionStatus;
    /** Machine-readable reason code, e.g. OK, GRACE_PERIOD, TENANT_SUSPENDED. */
    reason: string;
    /** Whole days left in the current window, null when not applicable. */
    daysLeft: number | null;
}

/** Added to a login/refresh response when the tenant is not fully entitled. */
export interface TenantAccessWarning {
    code: string;
    mode: TenantAccessMode;
    status: SubscriptionStatus;
    effectiveStatus: SubscriptionStatus;
    reason: string;
    daysLeft: number | null;
    graceDays: number;
}

function daysUntil(target: Date, now: Date): number {
    return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / MS_PER_DAY));
}

/**
 * Pure derivation. `now` is an explicit parameter so every transition is unit
 * testable with a fixed clock and no database.
 */
export function evaluateTenantAccess(
    row: TenantAccessRow,
    now: Date = new Date()
): TenantAccess {
    const graceDays = getGraceDays();
    const status = row.subscription_status;

    // Platform suspend / emergency kill switch. It outranks the subscription
    // lifecycle: a suspended account must not keep trial or grace entitlements.
    if (!row.is_active) {
        return {
            mode: 'BLOCKED',
            status,
            effectiveStatus: status,
            reason: 'RESTAURANT_INACTIVE',
            daysLeft: null,
        };
    }

    // Already suspended: stays read-only until a status change writes a new status.
    if (status === 'SUSPENDED') {
        return {
            mode: 'READ_ONLY',
            status,
            effectiveStatus: 'SUSPENDED',
            reason: 'TENANT_SUSPENDED',
            daysLeft: null,
        };
    }

    const endDate =
        status === 'ACTIVE' || status === 'GRACE'
            ? row.subscription_expires_at
            : row.trial_ends_at;

    // No end date on record: nothing to derive from, so the stored status stands.
    // Trial rows are backfilled with a 14-day end by the Task 04 migration.
    if (!endDate) {
        return {
            mode: 'FULL',
            status,
            effectiveStatus: status === 'GRACE' ? 'GRACE' : status,
            reason: status === 'GRACE' ? 'GRACE_PERIOD' : 'OK',
            daysLeft: null,
        };
    }

    if (now.getTime() <= endDate.getTime()) {
        return {
            mode: 'FULL',
            status,
            effectiveStatus: status,
            reason: 'OK',
            daysLeft: daysUntil(endDate, now),
        };
    }

    const graceEnd = new Date(endDate.getTime() + graceDays * MS_PER_DAY);

    if (now.getTime() <= graceEnd.getTime()) {
        return {
            mode: 'FULL',
            status,
            effectiveStatus: 'GRACE',
            reason: 'GRACE_PERIOD',
            daysLeft: daysUntil(graceEnd, now),
        };
    }

    return {
        mode: 'READ_ONLY',
        status,
        effectiveStatus: 'SUSPENDED',
        reason: 'PERIOD_ENDED',
        daysLeft: null,
    };
}

/**
 * Warning field for a login/refresh/PIN response, or null when the tenant is
 * fully entitled and needs no banner.
 */
export function buildTenantAccessWarning(access: TenantAccess): TenantAccessWarning | null {
    if (access.mode === 'FULL' && access.effectiveStatus !== 'GRACE') return null;
    return {
        code: access.effectiveStatus === 'GRACE' ? 'GRACE_PERIOD' : 'TENANT_READ_ONLY',
        mode: access.mode,
        status: access.status,
        effectiveStatus: access.effectiveStatus,
        reason: access.reason,
        daysLeft: access.daysLeft,
        graceDays: getGraceDays(),
    };
}

/**
 * Minimal surface of the Prisma client this function needs. Declared structurally
 * so unit tests can pass a stub, and so both `PrismaClient` and
 * `Prisma.TransactionClient` satisfy it.
 */
type TenantDb = {
    restaurants: {
        // `any` on the argument keeps the structural type satisfiable by the
        // generic Prisma signature without casting at every call site.
        findUnique: (args: any) => Promise<any>;
    };
};

export class TenantNotFoundError extends Error {
    constructor(public readonly restaurantId: string) {
        super('Restaurant not found');
        this.name = 'TenantNotFoundError';
    }
}

/** Reads the tenant row and derives access. Throws TenantNotFoundError if absent. */
export async function getTenantAccess(
    db: TenantDb,
    restaurantId: string,
    now: Date = new Date()
): Promise<TenantAccess> {
    const row = (await db.restaurants.findUnique({
        where: { id: restaurantId },
        select: {
            is_active: true,
            subscription_status: true,
            trial_ends_at: true,
            subscription_expires_at: true,
        },
    })) as TenantAccessRow | null;

    if (!row) throw new TenantNotFoundError(restaurantId);

    return evaluateTenantAccess(row, now);
}