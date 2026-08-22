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
}
