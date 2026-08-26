import { prisma } from '../../../shared/lib/prisma';
import bcrypt from 'bcrypt';
import { PaymentDispatcher } from '../payment/PaymentDispatcher';
import { journalEntryService } from '../JournalEntryService';
import { AccountingService } from '../AccountingService';
import { RefundResult } from '../payment/PaymentTypes';

// M018 F-02 — Refund flow for settled orders (design:
// docs/work-in-progress/REFUND_FLOW_DESIGN.md, rev2 APPROVED 2026-08-26).
//
// A refund is a money-moving reversal of a completed sale. It rides the same
// discipline as settlement: deterministic idempotency
// (REFUND:{tenant}:{order} UNIQUE), provider state machine never forced,
// balanced mirror-image journals, durable instance-scoped events, and a
// money-movement PIN ceremony whose identity is derived from the
// authenticated session — never from client input.

export class RefundError extends Error {
    constructor(
        public statusCode: number,
        public code: string,
        message: string,
        public extra?: Record<string, unknown>
    ) {
        super(message);
    }
}

const REFUND_REASON_CODES = ['CUSTOMER_REQUEST', 'ORDER_ERROR', 'FOOD_QUALITY', 'DUPLICATE_CHARGE', 'OTHER'] as const;

const DIGITAL_METHODS = new Set(['CARD', 'RAAST', 'JAZZCASH', 'EASYPAISA', 'NAYAPAY', 'SADAPAY']);

const PROVIDER_TYPE = 'MOCK_PAYMENT'; // founder provider decision swaps THIS only
const CASH_DRAWER_PROVIDER = 'CASH_DRAWER';

const accounting = new AccountingService();

function isRefundKeyConflict(e: any): boolean {
    return String(e?.code || '') === 'P2002';
}

export type RefundOutcome =
    | { refundStatus: 'COMPLETED' }
    | { refundStatus: 'FAILED' }
    | { refundStatus: 'UNKNOWN' };

export class RefundService {

    /**
     * Full-order refund request (design §13 authorization chain):
     * authenticated session → own-tenant order lookup → MANAGER+ (route) →
     * PIN ceremony → structured reason → session-context check → window
     * check → race-safe aggregate create → provider drive → commit.
     */
    static async requestRefund(params: {
        restaurantId: string;
        orderId: string;
        staffId: string;
        role: string;
        pin: string;
        reasonCode: string;
        reasonDetail?: string;
        sessionIdHeader?: string;
    }): Promise<{ refund: any; replay: boolean; refundStatus: string }> {

        const { restaurantId, orderId, staffId } = params;

        // ── Own-tenant order lookup (404 oracle for cross-tenant probes) ──
        const order = await prisma.orders.findFirst({
            where: { id: orderId, restaurant_id: restaurantId },
            include: { transactions: true },
        });
        if (!order) {
            throw new RefundError(404, 'ORDER_NOT_FOUND', 'Order not found');
        }

        const paidTxs = (order.transactions as any[]).filter(t => t.status === 'PAID');

        // ── Money-movement PIN ceremony (§1): server-side bcrypt
        // re-verification of the SESSION manager's own PIN. Identity comes
        // from the authenticated session; a valid session alone is not
        // consent. Credential material never enters audit or events.
        const manager = await prisma.staff.findFirst({
            where: { id: staffId, restaurant_id: restaurantId },
        });
        if (!manager || !manager.hashed_pin || !(await bcrypt.compare(params.pin, manager.hashed_pin))) {
            await prisma.audit_logs.create({
                data: {
                    restaurant_id: restaurantId,
                    action_type: 'REFUND_DENIED',
                    entity_type: 'ORDER',
                    entity_id: orderId,
                    staff_id: staffId,
                    details: {
                        denied_reason: 'PIN_VERIFICATION_FAILED',
                        role: params.role,
                    },
                },
            });
            throw new RefundError(403, 'REFUND_PIN_INVALID', 'Money-movement PIN verification failed');
        }

        // ── Structured reason form (§5)
        const reasonCode = String(params.reasonCode || '').trim();
        if (!REFUND_REASON_CODES.includes(reasonCode as any)) {
            throw new RefundError(400, 'REFUND_REASON_REQUIRED', `reason_code must be one of ${REFUND_REASON_CODES.join(', ')}`);
        }
        const reasonDetail = params.reasonDetail ? String(params.reasonDetail).trim().slice(0, 255) : null;

        // ── Fast-path (§3 layer 3): once an aggregate exists for this
        // deterministic key, EVERY retry — including one arriving after the
        // order already flipped REFUNDED — returns the aggregate's current
        // state verbatim. Replays never move money and never re-drive the
        // provider (R1/R3). A COMPLETED aggregate additionally gets its
        // local side effects re-applied idempotently: crash/retry after
        // provider acceptance completes from persisted state (§11).
        const refundKey = `REFUND:${restaurantId}:${orderId}`;
        const existing = await prisma.refunds.findFirst({ where: { refund_key: refundKey } });
        if (existing) {
            if (existing.status === 'COMPLETED') {
                await this.commitReversal(existing, order, paidTxs, staffId, params.sessionIdHeader || null);
                const fresh = await prisma.refunds.findUnique({ where: { id: existing.id } });
                return { refund: fresh || existing, replay: true, refundStatus: 'COMPLETED' };
            }
            return { refund: existing, replay: true, refundStatus: existing.status };
        }

        // ── Everything below protects a NEW money movement only (design
        // §2, §15): v1 scope is a full refund of a POS-settled order.
        if (order.payment_status !== 'PAID' || order.status !== 'CLOSED') {
            throw new RefundError(409, 'ORDER_NOT_SETTLED', `Order is not settled (payment_status: ${order.payment_status}, status: ${order.status})`);
        }
        if (order.type === 'DELIVERY') {
            throw new RefundError(409, 'REFUND_DELIVERY_UNSUPPORTED', 'Logistics-settled delivery refunds are out of scope for v1');
        }
        if (paidTxs.length === 0) {
            throw new RefundError(409, 'ORDER_NOT_SETTLED', 'Order has no paid tender lines to reverse');
        }
        if (paidTxs.some(t => !DIGITAL_METHODS.has(t.payment_method) && t.payment_method !== 'CASH')) {
            throw new RefundError(409, 'REFUND_TENDER_UNSUPPORTED', 'Only CASH and digital tenders are refundable in v1');
        }
        const hasCashTender = paidTxs.some(t => t.payment_method === 'CASH');

        // ── Session context (§7): a cash refund is a drawer event and can
        // only happen inside an OPEN session. Card/digital rails do not touch
        // the drawer and MAY proceed without one. Closed-session accounting
        // is never touched by construction.
        let sessionId: string | null = null;
        if (params.sessionIdHeader) {
            const session = await prisma.cashier_sessions.findUnique({ where: { id: params.sessionIdHeader } });
            if (!session || session.restaurant_id !== restaurantId) {
                throw new RefundError(403, 'REFUND_SESSION_TENANT_MISMATCH', 'Session does not belong to this restaurant');
            }
            if (session.status !== 'OPEN') {
                throw new RefundError(409, 'REFUND_SESSION_CLOSED', 'The referenced cashier session is closed');
            }
            sessionId = session.id;
        }
        if (hasCashTender && !sessionId) {
            throw new RefundError(409, 'REFUND_NO_OPEN_SESSION', 'A cash refund requires an open cashier session context');
        }

        // ── Time-window policy (§12): explicit, configurable,
        // server-enforced, audited — never unlimited-by-default.
        const restaurant = await prisma.restaurants.findUnique({
            where: { id: restaurantId },
            select: { id: true, refund_window_days: true },
        });
        const windowDays = restaurant?.refund_window_days ?? 7;
        const closedAt = order.closed_at || order.updated_at || new Date();
        const now = new Date();
        const cutoff = windowDays === 0
            ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
            : new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
        if (closedAt < cutoff) {
            // Blocked money-movement attempts are signals (F-01 precedent).
            await prisma.audit_logs.create({
                data: {
                    restaurant_id: restaurantId,
                    action_type: 'REFUND_WINDOW_EXCEEDED',
                    entity_type: 'ORDER',
                    entity_id: orderId,
                    staff_id: staffId,
                    details: {
                        reason_code: reasonCode,
                        refund_window_days: windowDays,
                        closed_at: closedAt.toISOString(),
                        role: params.role,
                    },
                },
            });
            throw new RefundError(403, 'REFUND_WINDOW_EXCEEDED', `Refund window of ${windowDays} day(s) has expired`, { refundWindowDays: windowDays });
        }

        // ── Ceremony record (§10): audit_logs ONLY, separate from the
        // business events. Written once per authorized ceremony attempt,
        // before any provider contact.
        await prisma.audit_logs.create({
            data: {
                restaurant_id: restaurantId,
                action_type: 'REFUND_REQUESTED',
                entity_type: 'ORDER',
                entity_id: orderId,
                staff_id: staffId,
                details: {
                    pin_verified: true,
                    reason_code: reasonCode,
                    ...(reasonDetail ? { reason_detail: reasonDetail } : {}),
                    role: params.role,
                    session_id: sessionId,
                    amount: Number(order.total),
                },
            },
        });

        // ── Race-safe aggregate create (§3 layer 1 + R1): the deterministic
        // key plus the storage UNIQUE admit exactly ONE INSERT. The loser
        // receives the winner's aggregate and NEVER reaches the provider.
        const hasDigitalTender = paidTxs.some(t => DIGITAL_METHODS.has(t.payment_method));
        let refund = await prisma.refunds.findFirst({ where: { refund_key: refundKey } });
        let created = false;

        if (!refund) {
            try {
                refund = await prisma.refunds.create({
                    data: {
                        restaurant_id: restaurantId,
                        order_id: orderId,
                        refund_key: refundKey,
                        amount: order.total,
                        currency: 'PKR',
                        status: 'PENDING',
                        provider: hasDigitalTender ? PROVIDER_TYPE : CASH_DRAWER_PROVIDER,
                        reason_code: reasonCode,
                        ...(reasonDetail ? { reason_detail: reasonDetail } : {}),
                        ...(sessionId ? { session_id: sessionId } : {}),
                        requested_by: staffId,
                    },
                });
                created = true;
            } catch (e) {
                if (!isRefundKeyConflict(e)) throw e;
                // Lost the race (§3 layer 2 fired): converge on the winner's
                // aggregate and serve it verbatim — no provider contact.
                refund = await prisma.refunds.findFirst({ where: { refund_key: refundKey } });
            }
        }

        if (!refund) {
            throw new RefundError(500, 'REFUND_IDENTITY_LOST', 'Refund aggregate could not be created or located');
        }
        if (!created) {
            return { refund, replay: true, refundStatus: refund.status };
        }

        // ── Winner: drive provider rails BEFORE the commit transaction
        // opens (a provider call never holds a database lock). Each digital
        // tender line reverses 1:1 to its own rail (§6); CASH needs none.
        const refundResults: RefundResult[] = [];
        if (hasDigitalTender) {
            const dispatcher = PaymentDispatcher.getInstance();
            for (const t of paidTxs.filter(tx => DIGITAL_METHODS.has(tx.payment_method))) {
                const result = await dispatcher.startRefundAttempt({
                    refundId: refund.id,
                    restaurantId,
                    orderId,
                    transactionId: t.id,
                    amount: Number(t.amount),
                    currency: refund.currency,
                    staffId,
                });
                refundResults.push(result);
            }
        }

        const rollup: 'COMPLETED' | 'FAILED' | 'UNKNOWN' = refundResults.some(r => r.outcome === 'UNKNOWN')
            ? 'UNKNOWN'
            : refundResults.some(r => r.outcome === 'FAILED')
                ? 'FAILED'
                : 'COMPLETED';

        if (rollup !== 'COMPLETED') {
            // R4 UNKNOWN discipline / FAILED semantics: no reversal journal,
            // no ledger movement, order stays PAID. Aggregate lands in its
            // terminal-or-reconcilable state; events are instance-scoped.
            await prisma.refunds.update({
                where: { id: refund.id },
                data: { status: rollup },
            });
            const eventType = rollup === 'UNKNOWN' ? 'ORDER_REFUND_UNKNOWN' : 'ORDER_REFUND_FAILED';
            const auditRow = await prisma.audit_logs.create({
                data: {
                    restaurant_id: restaurantId,
                    action_type: eventType,
                    entity_type: 'ORDER',
                    entity_id: orderId,
                    staff_id: staffId,
                    details: {
                        refund_id: refund.id,
                        reason_code: reasonCode,
                        amount: Number(order.total),
                        per_tender: paidTxs.map(t => ({ method: t.payment_method, amount: Number(t.amount) })),
                        role: params.role,
                    },
                },
            });
            await prisma.outbox.create({
                data: {
                    restaurant_id: restaurantId,
                    event_type: eventType,
                    aggregate_type: 'refunds',
                    aggregate_id: auditRow.id,
                    payload: {
                        orderId,
                        refundId: refund.id,
                        tenantId: restaurantId,
                        amount: Number(order.total),
                        refundStatus: rollup,
                        reasonCode,
                        actor: staffId,
                        actorRole: params.role,
                        correlationId: `refund:${refund.id}`,
                        occurredAt: new Date().toISOString(),
                    },
                },
            });
            const fresh = await prisma.refunds.findUnique({ where: { id: refund.id } });
            return { refund: fresh || refund, replay: false, refundStatus: rollup };
        }

        await this.commitReversal(refund, order, paidTxs, staffId, sessionId);
        const fresh = await prisma.refunds.findUnique({ where: { id: refund.id } });
        return { refund: fresh || refund, replay: false, refundStatus: 'COMPLETED' };
    }

    /**
     * Commit of the reversal side effects — ALWAYS inside ONE transaction:
     * mirror-image journal (ORDER_REFUND), reversal transaction rows,
     * mirrored ledger entries, order flip to REFUNDED, final aggregate
     * state, and the instance-scoped completion event. Idempotent as a
     * unit: an existing ORDER_REFUND journal proves prior commit.
     */
    private static async commitReversal(
        refund: any,
        order: any,
        paidTxs: any[],
        staffId: string,
        sessionId: string | null
    ): Promise<void> {
        const restaurantId = refund.restaurant_id;

        await prisma.$transaction(async (tx) => {
            const alreadyCommitted = await tx.journal_entries.findFirst({
                where: { reference_type: 'ORDER_REFUND', reference_id: refund.id },
            });
            if (alreadyCommitted) return;

            await journalEntryService.recordOrderRefundJournal({
                refundId: refund.id,
                orderId: order.id,
                expectedRestaurantId: restaurantId,
                processedBy: staffId,
            }, tx);

            for (const t of paidTxs) {
                const existingReversal = await tx.transactions.findFirst({
                    where: { order_id: order.id, transaction_ref: `REFUND:${refund.id}:${t.id}` },
                });
                if (existingReversal) continue;
                await tx.transactions.create({
                    data: {
                        restaurant_id: restaurantId,
                        order_id: order.id,
                        amount: t.amount,
                        payment_method: t.payment_method,
                        status: 'REFUNDED',
                        transaction_ref: `REFUND:${refund.id}:${t.id}`,
                    },
                });

                // Ledger mirrors keep Calculated Cash / day-close correct:
                // asset credit per tender line (drawer/card money out) plus
                // one revenue-reversal debit — the exact mirror of the sale
                // side's revenue credit + per-tender debits.
                await accounting.createLedgerEntry({
                    restaurantId,
                    transactionType: 'CREDIT',
                    amount: t.amount,
                    referenceType: 'REFUND',
                    referenceId: refund.id,
                    description: `${t.payment_method} refunded – Order #${order.order_number}`,
                    processedBy: staffId,
                }, tx);
            }

            await accounting.createLedgerEntry({
                restaurantId,
                transactionType: 'DEBIT',
                amount: order.total,
                referenceType: 'REFUND',
                referenceId: refund.id,
                description: `Sales Revenue reversed – Order #${order.order_number}`,
                processedBy: staffId,
            }, tx);

            // Guarded flip: only a PAID order becomes REFUNDED — refunds
            // never delete, void, or resurrect anything (R5/F-01 boundary).
            await tx.orders.updateMany({
                where: { id: order.id, restaurant_id: restaurantId, payment_status: 'PAID' },
                data: {
                    payment_status: 'REFUNDED',
                    last_action_by: staffId,
                    last_action_at: new Date(),
                },
            });

            await tx.refunds.update({
                where: { id: refund.id },
                data: {
                    status: 'COMPLETED',
                    completed_at: new Date(),
                    ...(sessionId ? { session_id: sessionId } : {}),
                },
            });

            const auditRow = await tx.audit_logs.create({
                data: {
                    restaurant_id: restaurantId,
                    action_type: 'ORDER_REFUND_COMPLETED',
                    entity_type: 'ORDER',
                    entity_id: order.id,
                    staff_id: staffId,
                    session_id: sessionId,
                    details: {
                        refund_id: refund.id,
                        reason_code: refund.reason_code,
                        amount: Number(refund.amount),
                        per_tender: paidTxs.map(t => ({ method: t.payment_method, amount: Number(t.amount) })),
                    },
                },
            });
            // Instance-scoped aggregate (M019 lesson): repeatable business
            // facts key their outbox triple on the audit-row instance, so a
            // second legitimate completion event can never be swallowed.
            await tx.outbox.create({
                data: {
                    restaurant_id: restaurantId,
                    event_type: 'ORDER_REFUND_COMPLETED',
                    aggregate_type: 'refunds',
                    aggregate_id: auditRow.id,
                    payload: {
                        orderId: order.id,
                        refundId: refund.id,
                        tenantId: restaurantId,
                        amount: Number(refund.amount),
                        currency: refund.currency,
                        perTender: paidTxs.map(t => ({ method: t.payment_method, amount: Number(t.amount) })),
                        reasonCode: refund.reason_code,
                        actor: staffId,
                        sessionId: sessionId,
                        correlationId: `refund:${refund.id}`,
                        occurredAt: new Date().toISOString(),
                    },
                },
            });
        });
    }

    /**
     * Reconcile an UNKNOWN refund (§9): resolution ONLY through this
     * ceremony-gated path — MANAGER+ (route) PLUS the money-movement PIN.
     * Reconcile must not become a journal-mutation side door: it resolves
     * the provider outcome the aggregate already recorded, then either
     * commits THE reversal (exactly once) or marks FAILED. Order stays
     * PAID until a COMPLETED resolution commits the reversal.
     */
    static async reconcileRefund(params: {
        restaurantId: string;
        refundId: string;
        staffId: string;
        role: string;
        pin: string;
        resolvedOutcome: 'COMPLETED' | 'FAILED';
    }): Promise<{ refund: any }> {
        const { restaurantId, refundId, staffId } = params;

        const refund = await prisma.refunds.findFirst({
            where: { id: refundId, restaurant_id: restaurantId },
        });
        if (!refund) {
            throw new RefundError(404, 'REFUND_NOT_FOUND', 'Refund not found');
        }
        if (refund.status !== 'UNKNOWN') {
            throw new RefundError(409, 'REFUND_NOT_UNKNOWN', `Refund is not UNKNOWN (status: ${refund.status})`);
        }

        const manager = await prisma.staff.findFirst({
            where: { id: staffId, restaurant_id: restaurantId },
        });
        if (!manager || !manager.hashed_pin || !(await bcrypt.compare(params.pin, manager.hashed_pin))) {
            await prisma.audit_logs.create({
                data: {
                    restaurant_id: restaurantId,
                    action_type: 'REFUND_RECONCILE_DENIED',
                    entity_type: 'REFUND',
                    entity_id: refundId,
                    staff_id: staffId,
                    details: { denied_reason: 'PIN_VERIFICATION_FAILED', role: params.role },
                },
            });
            throw new RefundError(403, 'REFUND_PIN_INVALID', 'Money-movement PIN verification failed');
        }

        const order = await prisma.orders.findFirst({
            where: { id: refund.order_id, restaurant_id: restaurantId },
            include: { transactions: true },
        });
        if (!order) {
            throw new RefundError(404, 'ORDER_NOT_FOUND', 'Order not found');
        }
        const paidTxs = (order.transactions as any[]).filter(t => t.status === 'PAID');

        if (params.resolvedOutcome === 'COMPLETED') {
            await this.commitReversal(refund, order, paidTxs, staffId, refund.session_id || null);
        } else {
            await prisma.refunds.update({
                where: { id: refund.id },
                data: { status: 'FAILED' },
            });
            const auditRow = await prisma.audit_logs.create({
                data: {
                    restaurant_id: restaurantId,
                    action_type: 'ORDER_REFUND_FAILED',
                    entity_type: 'ORDER',
                    entity_id: order.id,
                    staff_id: staffId,
                    details: {
                        refund_id: refund.id,
                        reconciled_from: 'UNKNOWN',
                        reason_code: refund.reason_code,
                        amount: Number(refund.amount),
                        role: params.role,
                    },
                },
            });
            await prisma.outbox.create({
                data: {
                    restaurant_id: restaurantId,
                    event_type: 'ORDER_REFUND_FAILED',
                    aggregate_type: 'refunds',
                    aggregate_id: auditRow.id,
                    payload: {
                        orderId: order.id,
                        refundId: refund.id,
                        tenantId: restaurantId,
                        amount: Number(refund.amount),
                        refundStatus: 'FAILED',
                        reconciledFrom: 'UNKNOWN',
                        reasonCode: refund.reason_code,
                        actor: staffId,
                        actorRole: params.role,
                        correlationId: `refund:${refund.id}`,
                        occurredAt: new Date().toISOString(),
                    },
                },
            });
        }

        const fresh = await prisma.refunds.findUnique({ where: { id: refund.id } });
        return { refund: fresh };
    }
}
