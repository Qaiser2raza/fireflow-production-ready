export type IntegrationContext = {
  integrationId: string;
  restaurantId: string;
  locationId?: string;
  correlationId: string;
  idempotencyKey: string;
  source: "OUTBOX_DISPATCHER";
};

export type ConnectorRequest = {
  eventType: string;
  eventVersion: number;
  payload: unknown;
  context: IntegrationContext;
};

export type ConnectorResult =
  | {
      outcome: "ACCEPTED" | "COMPLETED";
      externalReference?: string;
      providerStatus?: string;
    }
  | {
      outcome: "RETRYABLE_FAILURE";
      errorCode: string;
      errorMessage: string;
    }
  | {
      outcome: "PERMANENT_FAILURE";
      errorCode: string;
      errorMessage: string;
    }
  | {
      outcome: "UNKNOWN";
      errorCode: string;
      errorMessage: string;
    };

export interface FireFlowConnector {
  readonly type: string;
  readonly version: string;
  readonly capabilities: readonly string[];

  send(request: ConnectorRequest): Promise<ConnectorResult>;
}
