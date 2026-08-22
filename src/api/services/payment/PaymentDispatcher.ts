import { prisma } from '../../../shared/lib/prisma';
import { PaymentRegistry } from './PaymentRegistry';
import { PaymentRequest, PaymentResult, PaymentExecutionContext } from './PaymentTypes';
import crypto from 'crypto';

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

  async startAttempt(paymentId: string, context: PaymentExecutionContext): Promise<void> {
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

    if (payment.status !== 'PENDING') {
      throw new Error(`Payment is not PENDING: ${payment.status}`);
    }

    const provider = registry.get(payment.provider);
    if (!provider) {
      throw new Error(`Payment provider not registered: ${payment.provider}`);
    }

    const existingAttempt = await prisma.payment_attempts.findFirst({
      where: {
        payment_id: paymentId,
        request_idempotency_key: context.requestIdempotencyKey,
      },
    });

    if (existingAttempt) {
      if (existingAttempt.status === 'PENDING' || existingAttempt.status === 'PROCESSING') {
        return;
      }
      throw new Error(`Payment attempt already completed with status: ${existingAttempt.status}`);
    }

    const providerIdempotencyKey = `payment:${paymentId}:attempt:${crypto.randomUUID()}`;
    const correlationId = context.correlationId;

    const attempt = await prisma.payment_attempts.create({
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
        providerIdempotencyKey: providerIdempotencyKey,
        source: 'PAYMENT_DISPATCHER',
      },
    };

    const timeoutPromise = new Promise<PaymentResult>((resolve) => {
      setTimeout(() => {
        resolve({
          outcome: 'FAILED',
          errorCode: 'TIMEOUT',
          errorMessage: `Payment provider ${provider.type} timed out after ${DEFAULT_TIMEOUT_MS}ms`,
        });
      }, DEFAULT_TIMEOUT_MS);
    });

    const result = await Promise.race([provider.send(request), timeoutPromise]);

    await this.completeAttempt(attempt.id, payment.id, result);
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
}
