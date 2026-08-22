export type FiscalConnectorRequest = {
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

export type FiscalConnectorReconcileRequest = {
  fiscalDocumentId: string;
  outcome: "ISSUED" | "FAILED" | "UNKNOWN";
  providerReference?: string;
  issuedAt?: string;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, string>;
};

export type FiscalConnectorReconcileResponse = {
  accepted: boolean;
  fiscalDocumentId: string;
  status: string;
  message?: string;
};
