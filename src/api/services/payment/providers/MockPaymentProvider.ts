import { PaymentProvider, PaymentRequest, PaymentResult, RefundRequest, RefundResult } from '../PaymentTypes';

export type MockPaymentMode = 'SUCCESS' | 'FAILED' | 'UNKNOWN';

export class MockPaymentProvider implements PaymentProvider {
  readonly type = 'MOCK_PAYMENT';
  readonly version = '1.0.0';
  readonly capabilities: readonly string[] = ['CARD', 'CASH', 'RAAST'];

  private mode: MockPaymentMode = 'SUCCESS';
  private readonly receivedCalls: Array<{ providerIdempotencyKey: string; outcome: PaymentResult['outcome'] }> = [];
  private readonly receivedIdempotencyKeys: Set<string> = new Set();
  private readonly receivedRefundCalls: Array<{ providerIdempotencyKey: string; outcome: RefundResult['outcome'] }> = [];
  private readonly receivedRefundKeys: Set<string> = new Set();

  setMode(mode: MockPaymentMode): void {
    this.mode = mode;
  }

  getReceivedCalls(): Array<{ providerIdempotencyKey: string; outcome: PaymentResult['outcome'] }> {
    return [...this.receivedCalls];
  }

  getReceivedRefundCalls(): Array<{ providerIdempotencyKey: string; outcome: RefundResult['outcome'] }> {
    return [...this.receivedRefundCalls];
  }

  hasReceivedIdempotencyKey(key: string): boolean {
    return this.receivedIdempotencyKeys.has(key);
  }

  hasReceivedRefundKey(key: string): boolean {
    return this.receivedRefundKeys.has(key);
  }

  clearHistory(): void {
    this.receivedCalls.length = 0;
    this.receivedIdempotencyKeys.clear();
    this.receivedRefundCalls.length = 0;
    this.receivedRefundKeys.clear();
  }

  async send(request: PaymentRequest): Promise<PaymentResult> {
    const outcome = this.resolveOutcome(request.context.providerIdempotencyKey);
    this.receivedCalls.push({
      providerIdempotencyKey: request.context.providerIdempotencyKey,
      outcome: outcome.outcome,
    });
    this.receivedIdempotencyKeys.add(request.context.providerIdempotencyKey);
    return outcome;
  }

  // M018 F-02: refund rail. A repeated key NEVER produces a second logical
  // operation — the first call's result is replayed verbatim (provider-side
  // idempotency, design §3 layer 2). The recorded history is the evidence
  // surface for the no-double-reversal race assertion (matrix row 14).
  async refund(request: RefundRequest): Promise<RefundResult> {
    const existing = this.receivedRefundCalls.find(c => c.providerIdempotencyKey === request.context.providerIdempotencyKey);
    if (existing) {
      if (existing.outcome === 'COMPLETED') {
        return { outcome: 'COMPLETED', externalReference: `mock-refund-${request.context.providerIdempotencyKey.slice(-8)}` };
      }
      return existing.outcome === 'FAILED'
        ? { outcome: 'FAILED', errorCode: 'MOCK_REFUND_FAILED', errorMessage: 'Mock refund provider simulated failure (replayed)' }
        : { outcome: 'UNKNOWN', errorCode: 'MOCK_REFUND_UNKNOWN', errorMessage: 'Mock refund provider simulated unknown outcome (replayed)' };
    }

    let outcome: RefundResult;
    switch (this.mode) {
      case 'SUCCESS':
        outcome = { outcome: 'COMPLETED', externalReference: `mock-refund-${request.context.providerIdempotencyKey.slice(-8)}` };
        break;
      case 'FAILED':
        outcome = { outcome: 'FAILED', errorCode: 'MOCK_REFUND_FAILED', errorMessage: 'Mock refund provider simulated failure' };
        break;
      case 'UNKNOWN':
        outcome = { outcome: 'UNKNOWN', errorCode: 'MOCK_REFUND_UNKNOWN', errorMessage: 'Mock refund provider simulated unknown outcome' };
        break;
      default:
        outcome = { outcome: 'UNKNOWN', errorCode: 'MOCK_REFUND_UNKNOWN_MODE', errorMessage: 'Unknown mock mode' };
    }
    this.receivedRefundCalls.push({
      providerIdempotencyKey: request.context.providerIdempotencyKey,
      outcome: outcome.outcome,
    });
    this.receivedRefundKeys.add(request.context.providerIdempotencyKey);
    return outcome;
  }

  private resolveOutcome(providerIdempotencyKey: string): PaymentResult {
    if (this.receivedIdempotencyKeys.has(providerIdempotencyKey)) {
      return { outcome: 'PAID', externalReference: `mock-payment-${providerIdempotencyKey.slice(-8)}` };
    }

    switch (this.mode) {
      case 'SUCCESS':
        return { outcome: 'PAID', externalReference: `mock-payment-${providerIdempotencyKey.slice(-8)}` };
      case 'FAILED':
        return {
          outcome: 'FAILED',
          errorCode: 'MOCK_PAYMENT_FAILED',
          errorMessage: 'Mock payment provider simulated failure',
        };
      case 'UNKNOWN':
        return {
          outcome: 'UNKNOWN',
          errorCode: 'MOCK_PAYMENT_UNKNOWN',
          errorMessage: 'Mock payment provider simulated unknown outcome',
        };
      default:
        return { outcome: 'UNKNOWN', errorCode: 'MOCK_PAYMENT_UNKNOWN_MODE', errorMessage: 'Unknown mock mode' };
    }
  }
}
