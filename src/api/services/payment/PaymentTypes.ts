export type PaymentExecutionContext = {
  paymentId: string;
  restaurantId: string;
  orderId: string;
  staffId: string;
  correlationId: string;
  requestIdempotencyKey: string;
  providerIdempotencyKey: string;
  source: "PAYMENT_DISPATCHER";
};

export type PaymentRequest = {
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  context: PaymentExecutionContext;
};

export type PaymentResult =
  | {
      outcome: "PAID";
      externalReference?: string;
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

export interface PaymentProvider {
  readonly type: string;
  readonly version: string;
  readonly capabilities: readonly string[];

  send(request: PaymentRequest): Promise<PaymentResult>;

  // M018 F-02: optional money-outward capability. Providers that cannot
  // reverse simply leave this undefined; the dispatcher refuses refund
  // attempts routed to them.
  refund?(request: RefundRequest): Promise<RefundResult>;
}

// ─── Refund rail (M018 F-02) ──────────────────────────────────────────────
// Mirror of the payment rail at the provider seam: deterministic provider
// idempotency (`refund:{refundId}:{transactionId}`), never-forced state,
// UNKNOWN is a first-class outcome that only reconciliation resolves.

export type RefundExecutionContext = {
  refundId: string;
  restaurantId: string;
  orderId: string;
  staffId: string;
  correlationId: string;
  providerIdempotencyKey: string;
  source: "REFUND_DISPATCHER";
};

export type RefundRequest = {
  refundId: string;
  transactionId: string;
  amount: number;
  currency: string;
  context: RefundExecutionContext;
};

export type RefundResult =
  | {
      outcome: "COMPLETED";
      externalReference?: string;
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
