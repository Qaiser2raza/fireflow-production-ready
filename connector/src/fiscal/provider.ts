export type ProviderIssueRequest = {
  requestId: string;
  fiscalDocumentId: string;
  orderId: string;
  restaurantId: string;
  documentType: string;
  currency: string;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  issuedAt: string;
  idempotencyKey: string;
  integrationId: string;
  documentVersion: number;
};

export type RegionalFiscalResult =
  | {
      outcome: "ISSUED";
      providerReference: string;
      issuedAt: string;
      metadata?: Record<string, string>;
    }
  | {
      outcome: "FAILED";
      errorCode: string;
      errorMessage: string;
    }
  | {
      outcome: "UNKNOWN";
      errorCode: string;
      errorMessage: string;
    };

export interface RegionalFiscalProvider {
  readonly type: string;
  readonly version: string;
  readonly capabilities: readonly string[];

  issue(request: ProviderIssueRequest): Promise<RegionalFiscalResult>;
}
