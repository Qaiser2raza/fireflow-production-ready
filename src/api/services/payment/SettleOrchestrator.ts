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
        const upperMethod = line.method.toUpperCase();
        const requestKey = `settle:${params.orderId}:${upperMethod}`.slice(0, 100);
        const settleLineKey = `SETTLE_LINE:${params.restaurantId}:${params.orderId}:${upperMethod}`.slice(0, 120);

        // L1 storage uniqueness (PA-1): the database admits exactly one
        // payments aggregate per logical settle line. P2002 losers converge on
        // the winner's row and never reach the provider.
        let paymentRow;
        try {
            paymentRow = await prisma.payments.create({
                data: {
                    restaurant_id: params.restaurantId,
                    order_id: params.orderId,
                    amount: line.amount,
                    currency: 'PKR',
                    status: 'PENDING',
                    provider: PROVIDER_TYPE,
                    settle_line_key: settleLineKey,
                },
            });
        } catch (e: any) {
            if (String(e?.code || '') !== 'P2002') throw e;
            paymentRow = await prisma.payments.findFirst({
                where: { settle_line_key: settleLineKey, restaurant_id: params.restaurantId },
            });
            if (!paymentRow) throw new Error('Settle line claim lost after P2002');
        }

        if (!paymentRow) throw new Error('Payment aggregate missing after claim');

        // Terminal fast-path: replay or classify existing aggregate without
        // re-driving the provider.
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
        if (paymentRow.status === 'FAILED') {
            return {
                outcome: 'FAILED',
                method: line.method,
                paymentId: paymentRow.id,
                errorMessage: `Provider reported FAILED for ${upperMethod}`,
            };
        }

        // Drive (winner fresh PENDING, or resume PROCESSING under CAS).
        const dispatchResult = await dispatcher.startAttempt(paymentRow.id, {
            paymentId: paymentRow.id,
            restaurantId: params.restaurantId,
            orderId: params.orderId,
            staffId: params.staffId || '',
            correlationId: crypto.randomUUID(),
            requestIdempotencyKey: requestKey,
            providerIdempotencyKey: '',
            source: 'PAYMENT_DISPATCHER',
        });

        if (dispatchResult.outcome === 'PAID') {
            paidLines.push({
                method: line.method,
                amount: Number(line.amount),
                externalReference: dispatchResult.externalReference,
            });
            continue;
        }
        if (dispatchResult.outcome === 'UNKNOWN') {
            return { outcome: 'UNKNOWN', method: line.method, paymentId: paymentRow.id };
        }
        return {
            outcome: 'FAILED',
            method: line.method,
            paymentId: paymentRow.id,
            errorMessage: dispatchResult.errorMessage,
        };
    }

    return { outcome: 'PAID', paidLines };
}
