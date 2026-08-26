import { prisma } from '../../../shared/lib/prisma';
import { PaymentDispatcher } from './PaymentDispatcher';
import crypto from 'crypto';

// M017-B: method-routed completion. CASH settles synchronously inside the
// settle commit transaction (Phase A contract). Every OTHER method is
// provider-mediated: its aggregate (`payments` row) is resolved through the
// PaymentDispatcher BEFORE the commit transaction opens, so a provider call
// never holds a database lock. Outcomes:
//   PAID    -> line joins the commit transaction (journal + events as Phase A)
//   FAILED  -> whole settle rejected (402); attempt lands in DEAD_LETTER
//   UNKNOWN -> whole settle refused (409); order stays open; the payment row
//              stays UNKNOWN until reconciled (invariant 6: unknown is never
//              failure), after which the client re-submits settle and the
//              fast-path below commits without touching the provider again.
// The registry currently carries MOCK_PAYMENT only; swapping in a real
// provider is a registry change, not a settle-route change (strangler seam).

export type SettleLine = { method: string; amount: number };
export type ResolvedLine = SettleLine & { externalReference?: string };

const INLINE_METHODS = new Set(['CASH']);

export function isProviderMediated(method: string): boolean {
    return !INLINE_METHODS.has(String(method || '').toUpperCase());
}

export type ProviderResolution =
    | { outcome: 'PAID'; paidLines: ResolvedLine[] }
    | { outcome: 'FAILED'; method: string; paymentId: string; errorMessage: string }
    | { outcome: 'UNKNOWN'; method: string; paymentId: string };

const PROVIDER_TYPE = 'MOCK_PAYMENT'; // founder provider decision swaps THIS only

export async function resolveProviderLines(params: {
    restaurantId: string;
    orderId: string;
    staffId?: string;
    lines: SettleLine[];
}): Promise<ProviderResolution> {
    const dispatcher = PaymentDispatcher.getInstance();
    const paidLines: ResolvedLine[] = [];

    for (const line of params.lines) {
        const requestKey = `settle:${params.orderId}:${line.method.toUpperCase()}`.slice(0, 100);

        // Fast-path / prior-outcome classification: an attempt for this exact
        // logical line may already exist (client retry after UNKNOWN, crash
        // between attempt and commit, duplicate submit). Never re-drive the
        // provider for a line whose aggregate already reached a terminal state.
        const priorAttempt = await prisma.payment_attempts.findFirst({
            where: { restaurant_id: params.restaurantId, request_idempotency_key: requestKey },
            orderBy: { created_at: 'desc' },
        });
        let paymentRow = priorAttempt
            ? await prisma.payments.findUnique({ where: { id: priorAttempt.payment_id } })
            : null;

        if (!paymentRow) {
            paymentRow = await prisma.payments.create({
                data: {
                    restaurant_id: params.restaurantId,
                    order_id: params.orderId,
                    amount: line.amount,
                    currency: 'PKR',
                    status: 'PENDING',
                    provider: PROVIDER_TYPE,
                },
            });
            await dispatcher.startAttempt(paymentRow.id, {
                paymentId: paymentRow.id,
                restaurantId: params.restaurantId,
                orderId: params.orderId,
                staffId: params.staffId || '',
                correlationId: crypto.randomUUID(),
                requestIdempotencyKey: requestKey,
                providerIdempotencyKey: '', // dispatcher generates its own; caller value unused
                source: 'PAYMENT_DISPATCHER',
            });
            paymentRow = (await prisma.payments.findUnique({ where: { id: paymentRow.id } }))!;
        }

        if (paymentRow.status === 'PAID') {
            paidLines.push({
                method: line.method,
                amount: Number(paymentRow.amount),
                externalReference: paymentRow.external_reference || undefined,
            });
            continue;
        }
        if (paymentRow.status === 'UNKNOWN') {
            return { outcome: 'UNKNOWN', method: line.method, paymentId: paymentRow.id };
        }
        return {
            outcome: 'FAILED',
            method: line.method,
            paymentId: paymentRow.id,
            errorMessage: priorAttempt?.last_error || `Provider reported ${paymentRow.status}`,
        };
    }

    return { outcome: 'PAID', paidLines };
}
