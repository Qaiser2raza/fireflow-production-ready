import { FireFlowConnector, ConnectorRequest, ConnectorResult } from '../../integration/IntegrationTypes';
import { FiscalConnectorRequest, RegionalFiscalResult } from '../FiscalConnectorContract';
import { HmacAuth } from '../HmacAuth';
import { logger, LogLevel } from '../../../../shared/lib/logger';
import crypto from 'crypto';

export class FiscalHttpConnector implements FireFlowConnector {
  readonly type = 'FISCAL_CONNECTOR';
  readonly version = '1.0.0';
  readonly capabilities: readonly string[] = ['FISCAL_DOCUMENT_REQUESTED'];

  private readonly baseUrl: string;
  private readonly hmacAuth: HmacAuth;
  private readonly keyId: string;

  constructor(baseUrl: string, hmacAuth: HmacAuth, keyId: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.hmacAuth = hmacAuth;
    this.keyId = keyId;
  }

  async send(request: ConnectorRequest): Promise<ConnectorResult> {
    const fiscalRequest = this.mapToFiscalRequest(request);
    const signedRequest = this.signRequest(fiscalRequest);

    const controller = new AbortController();
    const timeoutMs = 20000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/fiscal/issue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-FireFlow-Key-Id': signedRequest.keyId,
          'X-FireFlow-Timestamp': String(signedRequest.timestamp),
          'X-FireFlow-Nonce': signedRequest.nonce,
          'X-FireFlow-Request-Id': signedRequest.requestId,
          'X-FireFlow-Body-Hash': signedRequest.bodyHash,
          'X-FireFlow-Signature': signedRequest.signature,
          'X-FireFlow-Audience': signedRequest.audience,
        },
        body: JSON.stringify(fiscalRequest),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          outcome: 'UNKNOWN',
          errorCode: `HTTP_${response.status}`,
          errorMessage: `Connector returned ${response.status}: ${response.statusText}`,
        };
      }

      const result: RegionalFiscalResult = await response.json();
      return this.mapFromFiscalResult(result);
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        return {
          outcome: 'UNKNOWN',
          errorCode: 'TIMEOUT',
          errorMessage: `Fiscal connector timed out after ${timeoutMs}ms`,
        };
      }

      logger.log({
        level: LogLevel.ERROR,
        service: 'fiscal-http-connector',
        action: 'request_failed',
        error: { message: error.message },
      });
      return {
        outcome: 'UNKNOWN',
        errorCode: 'CONNECTION_ERROR',
        errorMessage: error.message || 'Unknown connector error',
      };
    }
  }

  private mapToFiscalRequest(request: ConnectorRequest): FiscalConnectorRequest {
    const payload = request.payload as any;
    return {
      requestId: request.context.idempotencyKey,
      fiscalDocumentId: payload.fiscalDocumentId,
      orderId: payload.orderId,
      restaurantId: payload.restaurantId,
      documentType: payload.documentType,
      currency: payload.currency,
      subtotal: payload.subtotal,
      taxTotal: payload.taxTotal,
      grandTotal: payload.grandTotal,
      issuedAt: payload.issuedAt || new Date().toISOString(),
      idempotencyKey: request.context.idempotencyKey,
      integrationId: request.context.integrationId,
      documentVersion: payload.documentVersion || 1,
    };
  }

  private signRequest(request: FiscalConnectorRequest) {
    const timestamp = Date.now();
    const nonce = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    const bodyString = JSON.stringify(request);
    const bodyHash = crypto.createHash('sha256').update(bodyString).digest('hex');

    const verifiedRequest = {
      keyId: this.keyId,
      audience: 'fireflow-fiscal-pk',
      timestamp,
      nonce,
      requestId,
      bodyHash,
      signature: '',
      expiryWindowMs: 5 * 60 * 1000,
    };

    const signature = this.hmacAuth.sign(verifiedRequest, request);
    verifiedRequest.signature = signature;

    return verifiedRequest;
  }

  private mapFromFiscalResult(result: RegionalFiscalResult): ConnectorResult {
    switch (result.outcome) {
      case 'ISSUED':
        return {
          outcome: 'COMPLETED',
          externalReference: result.providerReference,
          providerStatus: result.metadata?.status,
        };
      case 'FAILED':
        return {
          outcome: 'PERMANENT_FAILURE',
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        };
      case 'UNKNOWN':
        return {
          outcome: 'UNKNOWN',
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        };
      default:
        return {
          outcome: 'UNKNOWN',
          errorCode: 'UNKNOWN_OUTCOME',
          errorMessage: `Unhandled connector outcome: ${(result as any).outcome}`,
        };
    }
  }
}
