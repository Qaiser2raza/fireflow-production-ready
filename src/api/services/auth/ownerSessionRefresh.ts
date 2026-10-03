/**
 * Task 03b — owner refresh resolution.
 *
 * A refresh must never guess the tenant. The restaurant comes from the session
 * row (`user_sessions.restaurant_id`, written when the owner picked a
 * workspace), and the membership for exactly that restaurant is re-checked on
 * every refresh. If it is gone, the session family dies and the owner signs in
 * again.
 *
 * Extracted from `handleUserSessionRefresh` in `src/api/server.ts` so the rule
 * is unit-testable without booting the API server.
 */
import { prisma as sharedPrisma } from '../../../shared/lib/prisma';
import {
    buildTenantAccessWarning,
    getTenantAccess,
    TenantNotFoundError,
    type TenantAccess,
} from '../tenant/getTenantAccess';
import type { UserSessionRecord } from './UserSessionService';

export type OwnerRefreshFailureCode =
    | 'SESSION_RESTAURANT_UNBOUND'
    | 'ACCOUNT_INACTIVE'
    | 'EMAIL_NOT_VERIFIED'
    | 'MEMBERSHIP_REVOKED'
    | 'STAFF_LINK_MISSING'
    | 'RESTAURANT_INACTIVE'
    | 'STAFF_INACTIVE'
    | 'TENANT_BLOCKED';

export type OwnerRefreshResolution =
    | {
        ok: true;
        restaurantId: string;
        user: { id: string; email: string | null; name: string | null };
        membership: { id: string; staff_id: string | null; role: string };
        staff: {
            id: string;
            restaurant_id: string;
            name: string;
            role: string;
            status: string;
            must_change_pin: boolean | null;
            is_email_verified: boolean | null;
            last_login: Date | null;
        };
        restaurant: { id: string; is_active: boolean; [key: string]: unknown };
        /** Task 04: derived access for the session's tenant. */
        tenantAccess: TenantAccess;
    }
    | {
        ok: false;
        code: OwnerRefreshFailureCode;
        status: number;
        error: string;
        /** True when the whole token family must be revoked (access is gone). */
        revokeFamily: boolean;
    };

export async function resolveOwnerRefreshTarget(
    db: typeof sharedPrisma,
    session: UserSessionRecord
): Promise<OwnerRefreshResolution> {
    // A pre-03b session row has no tenant. Never resolve it from memberships.
    if (!session.restaurantId) {
        return {
            ok: false,
            code: 'SESSION_RESTAURANT_UNBOUND',
            status: 401,
            error: 'Session is not bound to a restaurant. Please sign in again.',
            revokeFamily: true,
        };
    }

    const restaurantId = session.restaurantId;

    const user = await db.users.findUnique({
        where: { id: session.userId },
        select: { id: true, email: true, name: true, is_active: true, email_verified_at: true },
    });

    if (!user || !user.is_active) {
        return {
            ok: false,
            code: 'ACCOUNT_INACTIVE',
            status: 401,
            error: 'Account is no longer active',
            revokeFamily: true,
        };
    }

    if (!user.email_verified_at) {
        return {
            ok: false,
            code: 'EMAIL_NOT_VERIFIED',
            status: 401,
            error: 'Please verify your email address before logging in.',
            revokeFamily: false,
        };
    }

    // Exactly the session's restaurant — not "the most recently updated
    // membership", which silently switched tenants for multi-workspace owners.
    const membership = await db.memberships.findUnique({
        where: { user_id_restaurant_id: { user_id: user.id, restaurant_id: restaurantId } },
        include: { restaurant: { select: { id: true, is_active: true } } },
    });

    if (!membership) {
        return {
            ok: false,
            code: 'MEMBERSHIP_REVOKED',
            status: 403,
            error: 'You no longer have access to this restaurant. Please sign in again.',
            revokeFamily: true,
        };
    }

    if (!membership.staff_id) {
        return {
            ok: false,
            code: 'STAFF_LINK_MISSING',
            status: 403,
            error: 'This account is not linked to a staff profile in this restaurant yet.',
            revokeFamily: false,
        };
    }

    if (!membership.restaurant.is_active) {
        return {
            ok: false,
            code: 'RESTAURANT_INACTIVE',
            status: 403,
            error: 'Restaurant is inactive',
            revokeFamily: false,
        };
    }

    const staff = await db.staff.findUnique({
        where: { id: membership.staff_id },
        select: {
            id: true,
            restaurant_id: true,
            name: true,
            role: true,
            status: true,
            must_change_pin: true,
            is_email_verified: true,
            last_login: true,
        },
    });

    if (!staff || staff.restaurant_id !== restaurantId || staff.status !== 'active') {
        return {
            ok: false,
            code: 'STAFF_INACTIVE',
            status: 401,
            error: 'The staff profile linked to this membership is no longer active.',
            revokeFamily: true,
        };
    }

    // Task 04: tenant status / trial / grace. READ_ONLY (suspended) never rejects a
    // refresh — the family survives so an upgraded tenant resumes without a new
    // login. Only BLOCKED (is_active = false, or a tenant row that disappeared
    // between the membership read and this one) ends the session.
    let tenantAccess: TenantAccess;
    try {
        tenantAccess = await getTenantAccess(db, restaurantId);
    } catch (err) {
        if (err instanceof TenantNotFoundError) {
            return {
                ok: false,
                code: 'TENANT_BLOCKED',
                status: 403,
                error: 'Restaurant is no longer available.',
                revokeFamily: true,
            };
        }
        throw err;
    }

    if (tenantAccess.mode === 'BLOCKED') {
        return {
            ok: false,
            code: 'TENANT_BLOCKED',
            status: 403,
            error: 'This restaurant account is blocked. Please contact support.',
            revokeFamily: true,
        };
    }

    return {
        ok: true,
        restaurantId,
        user: { id: user.id, email: user.email, name: user.name },
        membership: { id: membership.id, staff_id: membership.staff_id, role: membership.role },
        staff: {
            id: staff.id,
            name: staff.name,
            role: staff.role,
            restaurant_id: staff.restaurant_id,
            status: staff.status,
            must_change_pin: staff.must_change_pin,
            is_email_verified: staff.is_email_verified,
            last_login: staff.last_login,
        },
        restaurant: membership.restaurant,
        tenantAccess,
    };
}

/**
 * Task 03f: the refresh response must look like a login response, so the client
 * can hand both to the same `completeLogin()` and stay logged in after a reload.
 * Never contains a password hash, a PIN or any token other than the access one
 * (the refresh token lives in the httpOnly cookie only).
 */
export function buildOwnerSessionPayload(input: {
    accessToken: string;
    email: string | null;
    staff: {
        id: string;
        name: string;
        role: string;
        restaurant_id: string;
        status: string;
        must_change_pin: boolean | null;
        is_email_verified: boolean | null;
    };
    restaurant: unknown;
    lastLogin?: Date | null;
    deviceTrusted?: boolean;
    /** Task 04: derived tenant access. Adds a warning for GRACE / READ_ONLY. */
    tenantAccess?: TenantAccess;
}): Record<string, unknown> {
    const tenantWarning = input.tenantAccess ? buildTenantAccessWarning(input.tenantAccess) : null;
    return {
        success: true,
        accessToken: input.accessToken,
        staff: {
            id: input.staff.id,
            name: input.staff.name,
            email: input.email,
            role: input.staff.role,
            restaurant_id: input.staff.restaurant_id,
            status: input.staff.status,
            must_change_password: false,
            must_change_pin: input.staff.must_change_pin === true,
            is_email_verified: input.staff.is_email_verified,
            last_login: input.lastLogin || null,
        },
        device: { trusted: Boolean(input.deviceTrusted), enrolled: Boolean(input.deviceTrusted) },
        restaurant: input.restaurant,
        tenantAccess: input.tenantAccess
            ? {
                mode: input.tenantAccess.mode,
                status: input.tenantAccess.status,
                effectiveStatus: input.tenantAccess.effectiveStatus,
                reason: input.tenantAccess.reason,
                daysLeft: input.tenantAccess.daysLeft,
            }
            : null,
        warning: tenantWarning,
        tokens: {
            access_token: input.accessToken,
            expires_in: 15 * 60,
        },
    };
}
