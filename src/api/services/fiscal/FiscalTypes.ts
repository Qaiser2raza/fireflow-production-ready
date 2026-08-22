export type FiscalExecutionContext = {
  fiscalDocumentId: string;
  restaurantId: string;
  orderId: string;
  correlationId: string;
  idempotencyKey: string;
  source: "FISCAL_DISPATCHER" | "FISCAL_CONNECTOR";
};

export type FiscalIssueRequest = {
  fiscalDocumentId: string;
  orderId: string;
  documentType: string;
  currency: string;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  context: FiscalExecutionContext;
};

export type FiscalProviderResult =
  | {
      outcome: "ISSUED";
      providerReference: string;
      issuedAt: Date;
      providerStatus?: string;
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

export interface FiscalProvider {
  readonly type: string;
  readonly version: string;
  readonly capabilities: readonly string[];

  issueDocument(request: FiscalIssueRequest): Promise<FiscalProviderResult>;
}
