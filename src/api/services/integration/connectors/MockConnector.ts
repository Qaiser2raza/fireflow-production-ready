import { FireFlowConnector, ConnectorRequest, ConnectorResult } from '../IntegrationTypes';

export type MockConnectorMode = 'SUCCESS' | 'RETRYABLE_FAILURE' | 'PERMANENT_FAILURE' | 'UNKNOWN';

export class MockConnector implements FireFlowConnector {
  readonly type = 'MOCK';
  readonly version = '1.0.0';
  readonly capabilities: readonly string[] = ['ORDER_CREATED'];

  private mode: MockConnectorMode = 'SUCCESS';
  private readonly receivedCalls: Array<{ idempotencyKey: string; eventType: string; outcome: ConnectorResult['outcome'] }> = [];
  private readonly receivedIdempotencyKeys: Set<string> = new Set();

  setMode(mode: MockConnectorMode): void {
    this.mode = mode;
  }

  getReceivedCalls(): Array<{ idempotencyKey: string; eventType: string; outcome: ConnectorResult['outcome'] }> {
    return [...this.receivedCalls];
  }

  hasReceivedIdempotencyKey(key: string): boolean {
    return this.receivedIdempotencyKeys.has(key);
  }

  clearHistory(): void {
    this.receivedCalls.length = 0;
    this.receivedIdempotencyKeys.clear();
  }

  async send(request: ConnectorRequest): Promise<ConnectorResult> {
    const outcome = this.resolveOutcome(request.context.idempotencyKey);
    this.receivedCalls.push({
      idempotencyKey: request.context.idempotencyKey,
      eventType: request.eventType,
      outcome: outcome.outcome,
    });
    this.receivedIdempotencyKeys.add(request.context.idempotencyKey);
    return outcome;
  }

  private resolveOutcome(idempotencyKey: string): ConnectorResult {
    if (this.receivedIdempotencyKeys.has(idempotencyKey)) {
      return { outcome: 'COMPLETED', externalReference: `mock-ref-${idempotencyKey.slice(-8)}` };
    }

    switch (this.mode) {
      case 'SUCCESS':
        return { outcome: 'COMPLETED', externalReference: `mock-ref-${idempotencyKey.slice(-8)}` };
      case 'RETRYABLE_FAILURE':
        return {
          outcome: 'RETRYABLE_FAILURE',
          errorCode: 'MOCK_RETRYABLE',
          errorMessage: 'Mock connector simulated retryable failure',
        };
      case 'PERMANENT_FAILURE':
        return {
          outcome: 'PERMANENT_FAILURE',
          errorCode: 'MOCK_PERMANENT',
          errorMessage: 'Mock connector simulated permanent failure',
        };
      case 'UNKNOWN':
        return {
          outcome: 'UNKNOWN',
          errorCode: 'MOCK_UNKNOWN',
          errorMessage: 'Mock connector simulated unknown outcome',
        };
      default:
        return { outcome: 'UNKNOWN', errorCode: 'MOCK_UNKNOWN_MODE', errorMessage: 'Unknown mock mode' };
    }
  }
}
