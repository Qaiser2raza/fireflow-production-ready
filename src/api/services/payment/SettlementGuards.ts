/**
 * M017-A settlement idempotency attribution.
 *
 * Invariant: replay detection must be attributable to the SETTLEMENT
 * idempotency mechanisms themselves — never inferred from the mere existence
 * of any uniqueness violation inside the settle transaction.
 *
 * Attributable surfaces (exhaustive by design):
 *  1. orders.settlement_key
 *     Unique index `orders_settlement_key_key` written by this transaction.
 *  2. outbox completion-event key
 *     @@unique([aggregate_type, aggregate_id, event_type]) on the
 *     PAYMENT_COMPLETED / ORDER_COMPLETED rows this transaction writes for
 *     THIS order. This is the empirically proven concurrency surface: under a
 *     racing duplicate, the loser's same-row same-value order update no-ops
 *     through and the conflict surfaces here instead.
 *
 * Any future unique constraint added to tables written by the settle
 * transaction must re-audit this list (Phase A closure record; REGISTER).
 */

interface PrismaLikeError {
    code?: string;
    meta?: { target?: unknown };
}

export function isSettlementUniquenessConflict(e: unknown): boolean {
    const err = e as PrismaLikeError | null;
    if (!err || typeof err !== 'object' || err.code !== 'P2002') return false;
    const t = err.meta?.target;
    const target = Array.isArray(t) ? t.join('|') : String(t ?? '');
    if (!target) return false;
    if (target.includes('settlement_key')) return true;
    return target.includes('aggregate_type')
        && target.includes('aggregate_id')
        && target.includes('event_type');
}

/**
 * A1 payment-proof attribution: the ONLY unique surface a proof submission may
 * own is its deterministic proof key, stored in
 * subscription_payments.transaction_id (sha256 of tenant|period|method|
 * amount_minor|client_token — see POST /api/billing/payment-proof).
 * Any other integrity error inside the proof transaction propagates.
 */
export function isProofUniquenessConflict(e: unknown): boolean {
    const err = e as PrismaLikeError | null;
    if (!err || typeof err !== 'object' || err.code !== 'P2002') return false;
    const t = err.meta?.target;
    const target = Array.isArray(t) ? t.join('|') : String(t ?? '');
    return target.includes('proof_key') || target.includes('transaction_id');
}
