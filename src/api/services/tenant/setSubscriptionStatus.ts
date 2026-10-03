/**
 * Task 04 — the single writer for tenant status.
 *
 * A status change and its `subscription_events` row are written in ONE
 * transaction, so the history can never drift from the current status. Every
 * later writer (payment-proof approval, super admin approve/reject, plan change)
 * goes through here instead of writing `restaurants.subscription_status` itself.
 *
 * `subscription_events` is append-only: this function only ever creates rows.
 */
import type { Prisma, PrismaClient, SubscriptionActorType, SubscriptionStatus } from '@prisma/client';
import { getTrialDays } from './getTenantAccess';

export interface SetSubscriptionStatusInput {
    restaurantId: string;
    toStatus: SubscriptionStatus;
    actorType: SubscriptionActorType;
    actorId?: string | null;
    reason?: string | null;
    /** Set explicitly when a trial length is agreed; otherwise now + TRIAL_DAYS. */
    trialEndsAt?: Date | null;
    /** Current period end. Required to make ACTIVE meaningful. */
    subscriptionExpiresAt?: Date | null;
}

export interface SetSubscriptionStatusResult {
    restaurantId: string;
    fromStatus: SubscriptionStatus;
    toStatus: SubscriptionStatus;
    /** False when the tenant was already in the requested status (no event written). */
    changed: boolean;
    eventId: string | null;
}

/**
 * Any client that can open a transaction. A `Prisma.TransactionClient` cannot be
 * passed here: the status change and its event row must commit together, so this
 * function owns the transaction boundary.
 */
type StatusDb = Pick<PrismaClient, '$transaction'>;

/**
 * Everything the transition needs, and nothing more. A `Prisma.TransactionClient`
 * satisfies this structurally, which is what lets a caller that ALREADY owns a
 * transaction boundary (Task 04c manual billing) commit the payment row and the
 * status change together without this module giving up its own boundary.
 */
export type SubscriptionStatusTx = Pick<PrismaClient, 'restaurants' | 'subscription_events'>;

/**
 * The transition itself, run against whatever client the caller supplies.
 *
 * Callers must guarantee the surrounding boundary: the status change and its
 * event row are two writes and must commit together.
 */
async function applySubscriptionStatus(
    tx: SubscriptionStatusTx,
    input: SetSubscriptionStatusInput,
    now: Date
): Promise<SetSubscriptionStatusResult> {
    const { restaurantId, toStatus, actorType, actorId = null, reason = null } = input;

    const restaurant = await tx.restaurants.findUnique({
        where: { id: restaurantId },
        select: { id: true, subscription_status: true, trial_ends_at: true, subscription_expires_at: true },
    });

    if (!restaurant) {
        throw new Error(`Restaurant not found: ${restaurantId}`);
    }

    const fromStatus = restaurant.subscription_status;
    const data: Prisma.restaurantsUpdateInput = { subscription_status: toStatus };

    if (input.trialEndsAt !== undefined) {
        data.trial_ends_at = input.trialEndsAt;
    } else if (
        (toStatus === 'TRIAL' || toStatus === 'PENDING_REVIEW') &&
        restaurant.trial_ends_at === null
    ) {
        // A trial tenant with no end date would stay TRIAL forever, because
        // access is derived from dates on read.
        data.trial_ends_at = new Date(now.getTime() + getTrialDays() * 24 * 60 * 60 * 1000);
    }

    if (input.subscriptionExpiresAt !== undefined) {
        data.subscription_expires_at = input.subscriptionExpiresAt;
    }

    await tx.restaurants.update({ where: { id: restaurantId }, data });

    if (fromStatus === toStatus) {
        return { restaurantId, fromStatus, toStatus, changed: false, eventId: null };
    }

    const event = await tx.subscription_events.create({
        data: {
            restaurant_id: restaurantId,
            from_status: fromStatus,
            to_status: toStatus,
            actor_type: actorType,
            actor_id: actorId,
            reason,
        },
        select: { id: true },
    });

    return { restaurantId, fromStatus, toStatus, changed: true, eventId: event.id };
}

/**
 * The authoritative subscription-status writer, owning its own transaction.
 * Unchanged behaviour: same boundary, same semantics, same result shape.
 */
export async function setSubscriptionStatus(
    db: StatusDb,
    input: SetSubscriptionStatusInput,
    now: Date = new Date()
): Promise<SetSubscriptionStatusResult> {
    return db.$transaction((tx) => applySubscriptionStatus(tx, input, now));
}

/**
 * The SAME transition, for a caller that already owns the transaction boundary
 * and needs its own writes to commit with it.
 *
 * This does not create a second way to change status: it runs the identical
 * `applySubscriptionStatus` body, so there is still exactly one implementation of
 * the rules. The only difference is who owns the boundary. Use this ONLY when the
 * caller can guarantee that a failure anywhere rolls the whole thing back —
 * otherwise use `setSubscriptionStatus`.
 */
export async function setSubscriptionStatusInTransaction(
    tx: SubscriptionStatusTx,
    input: SetSubscriptionStatusInput,
    now: Date = new Date()
): Promise<SetSubscriptionStatusResult> {
    return applySubscriptionStatus(tx, input, now);
}