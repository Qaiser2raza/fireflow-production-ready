import { FiscalProvider, FiscalIssueRequest, FiscalProviderResult } from '../FiscalTypes';

export type MockFiscalMode = 'SUCCESS' | 'FAILED' | 'UNKNOWN';

export class MockFiscalProvider implements FiscalProvider {
  readonly type = 'MOCK_FISCAL';
  readonly version = '1.0.0';
  readonly capabilities: readonly string[] = ['INVOICE'];

  private mode: MockFiscalMode = 'SUCCESS';
  private readonly receivedCalls: Array<{ idempotencyKey: string; outcome: FiscalProviderResult['outcome'] }> = [];
  private readonly receivedIdempotencyKeys: Set<string> = new Set();

  setMode(mode: MockFiscalMode): void {
    this.mode = mode;
  }

  getReceivedCalls(): Array<{ idempotencyKey: string; outcome: FiscalProviderResult['outcome'] }> {
    return [...this.receivedCalls];
  }

  hasReceivedIdempotencyKey(key: string): boolean {
    return this.receivedIdempotencyKeys.has(key);
  }

  clearHistory(): void {
    this.receivedCalls.length = 0;
    this.receivedIdempotencyKeys.clear();
  }

  async issueDocument(request: FiscalIssueRequest): Promise<FiscalProviderResult> {
    const outcome = this.resolveOutcome(request.context.idempotencyKey);
    this.receivedCalls.push({
      idempotencyKey: request.context.idempotencyKey,
      outcome: outcome.outcome,
    });
    this.receivedIdempotencyKeys.add(request.context.idempotencyKey);
    return outcome;
  }

  private resolveOutcome(idempotencyKey: string): FiscalProviderResult {
    if (this.receivedIdempotencyKeys.has(idempotencyKey)) {
      return {
        outcome: 'ISSUED',
        providerReference: `mock-fiscal-${idempotencyKey.slice(-8)}`,
        issuedAt: new Date(),
      };
    }

    switch (this.mode) {
      case 'SUCCESS':
        return {
          outcome: 'ISSUED',
          providerReference: `mock-fiscal-${idempotencyKey.slice(-8)}`,
          issuedAt: new Date(),
        };
      case 'FAILED':
        return {
          outcome: 'FAILED',
          errorCode: 'MOCK_FISCAL_FAILED',
          errorMessage: 'Mock fiscal provider simulated failure',
        };
      case 'UNKNOWN':
        return {
          outcome: 'UNKNOWN',
          errorCode: 'MOCK_FISCAL_UNKNOWN',
          errorMessage: 'Mock fiscal provider simulated unknown outcome',
        };
      default:
        return { outcome: 'UNKNOWN', errorCode: 'MOCK_FISCAL_UNKNOWN_MODE', errorMessage: 'Unknown mock mode' };
    }
  }
}
