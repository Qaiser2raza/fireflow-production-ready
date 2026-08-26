import { prisma } from '../../../shared/lib/prisma';
import { PaymentRegistry } from './PaymentRegistry';
import { PaymentRequest, PaymentResult, PaymentExecutionContext, RefundRequest, RefundResult } from './PaymentTypes';

const DEFAULT_TIMEOUT_MS = 10000;

export class PaymentDispatcher {
  private static instance: PaymentDispatcher | null = null;

  private constructor() {}

  static getInstance(): PaymentDispatcher {
    if (!PaymentDispatcher.instance) {
      PaymentDispatcher.instance = new PaymentDispatcher();
    }
    return PaymentDispatcher.instance;
  }

  async startAttempt(paymentId: string, context: PaymentExecutionContext): Promise<PaymentResult> {
    const registry = PaymentRegistry.getInstance();

    const payment = await prisma.payments.findFirst({
      where: {
        id: paymentId,
        restaurant_id: context.restaurantId,
      },
      include: {
        orders: true,
      },
    });

    if (!payment) {
      throw new Error('Payment not found or unauthorized');
    }

    if (payment.orders.restaurant_id !== context.restaurantId) {
      throw new Error('Payment and order restaurant mismatch');
    }

    const provider = registry.get(payment.provider);
    if (!provider) {
      throw new Error(`Payment provider not registered: ${payment.provider}`);
    }

    // Terminal fast-path: an aggregate that already reached a terminal state
    // is returned verbatim — the provider is never re-driven.
    const terminal = this.classifyPaymentStatus(payment.status, payment.external_reference);
    if (terminal) return terminal;

    // L2 single-driver CAS (PA-1). Exactly one caller may transition
    // PENDING/PROCESSING -> PROCESSING. Losers read back and classify from
    // persisted state; they must never reach the provider themselves.
    const claimed = await prisma.payments.updateMany({
      where: { id: payment.id, status: { in: ['PENDING', 'PROCESSING'] } },
      data: { status: 'PROCESSING' },
    });
    if (claimed.count === 0) {
      const current = await prisma.payments.findUnique({ where: { id: payment.id } });
      const classified = this.classifyPaymentStatus(current?.status || 'UNKNOWN', current?.external_reference);
      if (classified) return classified;
      return { outcome: 'UNKNOWN', errorCode: 'PAYMENT_IN_FLIGHT', errorMessage: 'Concurrent settle in progress' };
    }

    // L3 deterministic provider idempotency: stable per aggregate, not per
    // attempt. All drives of one payment present the same key so the provider
    // dedupes across retries / resumed drives.
    const providerIdempotencyKey = `payment:${paymentId}`;

    const existingAttempt = await prisma.payment_attempts.findFirst({
      where: {
        payment_id: paymentId,
        request_idempotency_key: context.requestIdempotencyKey,
      },
    });

    if (existingAttempt) {
      if (existingAttempt.status === 'PENDING' || existingAttempt.status === 'PROCESSING') {
        return this.classifyPaymentStatus(payment.status, payment.external_reference) || { outcome: 'UNKNOWN', errorCode: 'ATTEMPT_IN_FLIGHT', errorMessage: 'Attempt already in progress' };
      }
      return this.classifyPaymentStatus(payment.status, payment.external_reference) || { outcome: 'UNKNOWN', errorCode: 'ATTEMPT_ALREADY_COMPLETED', errorMessage: `Payment attempt already completed with status: ${existingAttempt.status}` };
    }

    const correlationId = context.correlationId;

    let attempt;
    try {
      attempt = await prisma.payment_attempts.create({
        data: {
          payment_id: paymentId,
          restaurant_id: context.restaurantId,
          provider: payment.provider,
          request_idempotency_key: context.requestIdempotencyKey,
          provider_idempotency_key: providerIdempotencyKey,
          correlation_id: correlationId,
          status: 'PENDING',
        },
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        // A create-time P2002 on (provider, provider_idempotency_key)
        // always means another concurrent driver already created the attempt
        // for this deterministic key — external_reference is null at create,
        // so the other unique constraint cannot fire. Under Read Committed
        // the winning row may not be visible yet, so retry the read before
        // resolving; never re-throw (an in-flight attempt is not an error).
        let existing: Awaited<ReturnType<typeof prisma.payment_attempts.findFirst>> | null = null;
        for (let i = 0; i < 5 && !existing; i++) {
          existing = await prisma.payment_attempts.findFirst({
            where: {
              provider: payment.provider,
              provider_idempotency_key: providerIdempotencyKey,
            },
          });
          if (!existing) await new Promise((r) => setTimeout(r, 10));
        }
        if (existing?.status === 'PENDING' || existing?.status === 'PROCESSING') {
          return this.classifyPaymentStatus(payment.status, payment.external_reference) || { outcome: 'UNKNOWN', errorCode: 'ATTEMPT_IN_FLIGHT', errorMessage: 'Attempt already in progress' };
        }
        return this.classifyPaymentStatus(payment.status, payment.external_reference) || { outcome: 'UNKNOWN', errorCode: existing ? 'ATTEMPT_ALREADY_COMPLETED' : 'ATTEMPT_IN_FLIGHT', errorMessage: existing ? `Payment attempt already completed with status: ${existing.status}` : 'Concurrent attempt in progress' };
      }
      throw e;
    }

    await prisma.payment_attempts.update({
      where: { id: attempt.id },
      data: { status: 'PROCESSING' },
    });

    const request: PaymentRequest = {
      paymentId: payment.id,
      orderId: payment.order_id,
      amount: Number(payment.amount),
      currency: payment.currency,
      context: {
        paymentId: payment.id,
        restaurantId: context.restaurantId,
        orderId: payment.order_id,
        staffId: context.staffId,
        correlationId: context.correlationId,
        requestIdempotencyKey: context.requestIdempotencyKey,
        providerIdempotencyKey,
        source: 'PAYMENT_DISPATCHER',
      },
    };

    const timeoutPromise = new Promise<PaymentResult>((resolve) => {
      setTimeout(() => {
        resolve({
          outcome: 'UNKNOWN',
          errorCode: 'TIMEOUT',
          errorMessage: `Payment provider ${provider.type} timed out after ${DEFAULT_TIMEOUT_MS}ms`,
        });
      }, DEFAULT_TIMEOUT_MS);
    });

    const result = await Promise.race([provider.send(request), timeoutPromise]);
    await this.completeAttempt(attempt.id, payment.id, result);
    return result;
  }

  private async completeAttempt(attemptId: string, paymentId: string, result: PaymentResult): Promise<void> {
    const attemptUpdateData: any = {
      completed_at: new Date(),
    };

    let attemptStatus: string;
    if (result.outcome === 'PAID') {
      attemptStatus = 'COMPLETED';
      attemptUpdateData.external_reference = result.externalReference || null;
    } else if (result.outcome === 'FAILED') {
      attemptStatus = 'DEAD_LETTER';
      attemptUpdateData.last_error = result.errorMessage;
    } else {
      attemptStatus = 'UNKNOWN';
      attemptUpdateData.last_error = result.errorMessage;
    }

    attemptUpdateData.status = attemptStatus;

    await prisma.payment_attempts.update({
      where: { id: attemptId },
      data: attemptUpdateData,
    });

    const paymentUpdateData: any = {
      updated_at: new Date(),
    };

    if (result.outcome === 'PAID') {
      paymentUpdateData.status = 'PAID';
      paymentUpdateData.external_reference = result.externalReference || null;
    } else if (result.outcome === 'FAILED') {
      paymentUpdateData.status = 'FAILED';
    } else if (result.outcome === 'UNKNOWN') {
      paymentUpdateData.status = 'UNKNOWN';
    }

    await prisma.payments.update({
      where: { id: paymentId },
      data: paymentUpdateData,
    });
  }

  private classifyPaymentStatus(status: string, externalReference?: string | null): PaymentResult | null {
    if (status === 'PAID') return { outcome: 'PAID', externalReference: externalReference || undefined };
    if (status === 'FAILED') return { outcome: 'FAILED', errorCode: 'PAYMENT_ALREADY_FAILED', errorMessage: 'Payment already FAILED' };
    if (status === 'UNKNOWN') return { outcome: 'UNKNOWN', errorCode: 'PAYMENT_ALREADY_UNKNOWN', errorMessage: 'Payment already UNKNOWN' };
    return null;
  }

  async reconcileUnknown(paymentId: string, context: PaymentExecutionContext, resolvedOutcome: 'PAID' | 'FAILED'): Promise<void> {
    const payment = await prisma.payments.findFirst({
      where: {
        id: paymentId,
        restaurant_id: context.restaurantId,
      },
    });

    if (!payment) {
      throw new Error('Payment not found or unauthorized');
    }

    if (payment.status !== 'UNKNOWN') {
      throw new Error(`Payment is not UNKNOWN: ${payment.status}`);
    }

    await prisma.payments.update({
      where: { id: paymentId },
      data: {
        status: resolvedOutcome,
        updated_at: new Date(),
      },
    });

    const attempts = await prisma.payment_attempts.findMany({
      where: { payment_id: paymentId },
      orderBy: { created_at: 'desc' },
      take: 1,
    });

    if (attempts.length > 0) {
      const attemptUpdateData: any = {
        completed_at: new Date(),
      };

      if (resolvedOutcome === 'PAID') {
        attemptUpdateData.status = 'COMPLETED';
        attemptUpdateData.last_error = null;
      } else {
        attemptUpdateData.status = 'DEAD_LETTER';
        attemptUpdateData.last_error = 'Reconciled as FAILED';
      }

      await prisma.payment_attempts.update({
        where: { id: attempts[0].id },
        data: attemptUpdateData,
      });
    }
  }

  // ─── Refund path (M018 F-02) ────────────────────────────────────────────
  // Drives ONE provider refund operation for one tender line of a refunds
  // aggregate. Discipline mirrors startAttempt, with two refund-specific
  // hardenings (design §3/§11):
  //   1. The provider idempotency key is DETERMINISTIC
  //      (`refund:{refundId}:{transactionId}`) so a retry after a crash
  //      between provider acceptance and local commit dedupes at the
  //      provider — a second outward movement is impossible.
  //   2. A storage-layer claim (PENDING|PROCESSING → PROCESSING) admits a
  //      single driver; losers classify from persisted state and never
  //      reach the provider.
  // The outcome is persisted to the refunds aggregate IMMEDIATELY after the
  // provider answers (durable provider truth), before any commit transaction
  // opens — a provider call never holds a database lock.
  async startRefundAttempt(params: {
    refundId: string;
    restaurantId: string;
    orderId: string;
    transactionId: string;
    amount: number;
    currency: string;
    staffId?: string;
  }): Promise<RefundResult> {
    const registry = PaymentRegistry.getInstance();

    const refund = await prisma.refunds.findFirst({
      where: { id: params.refundId, restaurant_id: params.restaurantId },
    });
    if (!refund) {
      throw new Error('Refund not found or unauthorized');
    }

    const provider = registry.get(refund.provider);
    if (!provider) {
      throw new Error(`Payment provider not registered: ${refund.provider}`);
    }
    if (typeof provider.refund !== 'function') {
      throw new Error(`Provider ${refund.provider} has no refund capability`);
    }

    const providerIdempotencyKey = `refund:${refund.id}:${params.transactionId}`;

    // Terminal fast-path: an aggregate that already reached a terminal state
    // is returned verbatim — the provider is never re-driven.
    const terminal = this.classifyRefundStatus(refund.status, refund.external_reference);
    if (terminal) return terminal;

    // Single-driver claim. Losers read back and classify — they may be
    // racing a live drive or observing its durable outcome.
    const claimed = await prisma.refunds.updateMany({
      where: { id: refund.id, status: { in: ['PENDING', 'PROCESSING'] } },
      data: { status: 'PROCESSING' },
    });
    if (claimed.count === 0) {
      const current = await prisma.refunds.findUnique({ where: { id: refund.id } });
      const classified = this.classifyRefundStatus(current?.status || 'UNKNOWN', current?.external_reference || undefined);
      return classified || { outcome: 'UNKNOWN', errorCode: 'REFUND_CONCURRENT_DRIVE', errorMessage: 'Another driver owns this refund' };
    }

    const request: RefundRequest = {
      refundId: refund.id,
      transactionId: params.transactionId,
      amount: params.amount,
      currency: params.currency,
      context: {
        refundId: refund.id,
        restaurantId: params.restaurantId,
        orderId: params.orderId,
        staffId: params.staffId || '',
        correlationId: `refund:${refund.id}`,
        providerIdempotencyKey,
        source: 'REFUND_DISPATCHER',
      },
    };

    const timeoutPromise = new Promise<RefundResult>((resolve) => {
      setTimeout(() => {
        resolve({
          outcome: 'UNKNOWN',
          errorCode: 'TIMEOUT',
          errorMessage: `Refund provider ${provider.type} timed out after ${DEFAULT_TIMEOUT_MS}ms`,
        });
      }, DEFAULT_TIMEOUT_MS);
    });

    const result = await Promise.race([provider.refund(request), timeoutPromise]);
    await this.applyRefundOutcome(refund.id, result);
    return result;
  }

  private async applyRefundOutcome(refundId: string, result: RefundResult): Promise<void> {
    if (result.outcome === 'COMPLETED') {
      await prisma.refunds.update({
        where: { id: refundId },
        data: {
          status: 'COMPLETED',
          external_reference: result.externalReference || null,
          completed_at: new Date(),
        },
      });
    } else if (result.outcome === 'FAILED') {
      await prisma.refunds.update({
        where: { id: refundId },
        data: { status: 'FAILED' },
      });
    } else {
      await prisma.refunds.update({
        where: { id: refundId },
        data: { status: 'UNKNOWN' },
      });
    }
  }

  private classifyRefundStatus(status: string, externalReference?: string | null): RefundResult | null {
    if (status === 'COMPLETED') return { outcome: 'COMPLETED', externalReference: externalReference || undefined };
    if (status === 'FAILED') return { outcome: 'FAILED', errorCode: 'REFUND_ALREADY_FAILED', errorMessage: 'Refund already FAILED' };
    if (status === 'UNKNOWN') return { outcome: 'UNKNOWN', errorCode: 'REFUND_ALREADY_UNKNOWN', errorMessage: 'Refund already UNKNOWN' };
    return null;
  }
}
