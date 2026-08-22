import { PaymentProvider, PaymentRequest, PaymentResult } from '../PaymentTypes';

export type MockPaymentMode = 'SUCCESS' | 'FAILED' | 'UNKNOWN';

export class MockPaymentProvider implements PaymentProvider {
  readonly type = 'MOCK_PAYMENT';
  readonly version = '1.0.0';
  readonly capabilities: readonly string[] = ['CARD', 'CASH', 'RAAST'];

  private mode: MockPaymentMode = 'SUCCESS';
  private readonly receivedCalls: Array<{ providerIdempotencyKey: string; outcome: PaymentResult['outcome'] }> = [];
  private readonly receivedIdempotencyKeys: Set<string> = new Set();

  setMode(mode: MockPaymentMode): void {
    this.mode = mode;
  }

  getReceivedCalls(): Array<{ providerIdempotencyKey: string; outcome: PaymentResult['outcome'] }> {
    return [...this.receivedCalls];
  }

  hasReceivedIdempotencyKey(key: string): boolean {
    return this.receivedIdempotencyKeys.has(key);
  }

  clearHistory(): void {
    this.receivedCalls.length = 0;
    this.receivedIdempotencyKeys.clear();
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
