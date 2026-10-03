/**
 * Task 04 — the ONE shared tenant-status fixture helper.
 *
 * `restaurants.subscription_status` is the `SubscriptionStatus` enum
 * (TRIAL | PENDING_REVIEW | ACTIVE | GRACE | SUSPENDED). Suites must never
 * hardcode a status string: they import these constants, so a lifecycle change
 * is a single-file change instead of ~70 fixture edits.
 *
 * Note that a status is not an entitlement on its own: `getTenantAccess()`
 * derives access from the stored status plus `trial_ends_at` /
 * `subscription_expires_at`. `ACTIVE` / `TRIAL` with a null end date stay FULL,
 * which is what a plain fixture wants.
 */
import { SubscriptionStatus } from '@prisma/client';

export const TRIAL = SubscriptionStatus.TRIAL;
export const PENDING_REVIEW = SubscriptionStatus.PENDING_REVIEW;
export const ACTIVE = SubscriptionStatus.ACTIVE;
export const GRACE = SubscriptionStatus.GRACE;
export const SUSPENDED = SubscriptionStatus.SUSPENDED;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Period end far enough ahead that the tenant is unambiguously FULL. */
export function futureDate(days = 30): Date {
    return new Date(Date.now() + days * MS_PER_DAY);
}

/** Just past, so the tenant derives into GRACE (inside the grace window). */
export function pastDate(days = 1): Date {
    return new Date(Date.now() - days * MS_PER_DAY);
}

/** Past the grace window as well, so the tenant derives into SUSPENDED. */
export function expiredDate(days = 30): Date {
    return new Date(Date.now() - days * MS_PER_DAY);
}