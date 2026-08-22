import { Prisma } from '@prisma/client';
import { prisma } from '../../../shared/lib/prisma';
import { IntegrationRegistry } from './IntegrationRegistry';
import { FireFlowConnector, ConnectorRequest, ConnectorResult, IntegrationContext } from './IntegrationTypes';

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 1000;
const LEASE_DURATION_MS = 30000;
const DEFAULT_TIMEOUT_MS = 10000;
const BATCH_SIZE = 50;

export class IntegrationDispatcher {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly pollIntervalMs: number;
  private readonly instanceId: string;

  constructor(pollIntervalMs: number = 1000) {
    this.pollIntervalMs = pollIntervalMs;
    this.instanceId = `integration-dispatcher-${process.pid}-${Math.random().toString(36).substring(2, 8)}`;
  }

  start(): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(async () => {
      await this.processOutbox();
    }, this.pollIntervalMs);

    console.log(`[IntegrationDispatcher] Started (instance: ${this.instanceId}, interval: ${this.pollIntervalMs}ms)`);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log(`[IntegrationDispatcher] Stopped`);
    }
  }

  private async processOutbox(): Promise<void> {
    try {
      const unprocessed = await prisma.outbox.findMany({
        where: {
          processed_at: null
        },
        orderBy: {
          created_at: 'asc'
        },
        take: BATCH_SIZE
      });

      if (unprocessed.length === 0) return;

      for (const outboxRow of unprocessed) {
        await this.dispatchOutboxEvent(outboxRow);
      }
    } catch (error: any) {
      console.error(`[IntegrationDispatcher] Error processing outbox: ${error.message}`);
    }
  }

  private async dispatchOutboxEvent(outboxRow: any): Promise<void> {
    const restaurantId = outboxRow.restaurant_id;
    const eventType = outboxRow.event_type;

    const activeIntegrations = await prisma.integrations.findMany({
      where: {
        restaurant_id: restaurantId,
        status: 'ENABLED'
      },
      include: {
        stations: true
      }
    });

    if (activeIntegrations.length === 0) return;

    const registry = IntegrationRegistry.getInstance();

    for (const integration of activeIntegrations) {
      const connector = registry.get(integration.connector_type);
      if (!connector) {
        console.warn(`[IntegrationDispatcher] No connector registered for type: ${integration.connector_type}`);
        continue;
      }

      if (!connector.capabilities.includes(eventType)) {
        continue;
      }

      const idempotencyKey = this.generateIdempotencyKey(integration.id, outboxRow.id);
      const correlationId = this.generateCorrelationId();

      const delivery = await this.findOrCreateDelivery(integration, outboxRow, idempotencyKey, correlationId);
      if (!delivery) {
        continue;
      }

      if (delivery.available_at > new Date()) {
        continue;
      }

      await this.processDelivery(delivery, integration, connector, outboxRow, correlationId, idempotencyKey);
    }
  }

  private async findOrCreateDelivery(integration: any, outboxRow: any, idempotencyKey: string, correlationId: string): Promise<any> {
    const now = new Date();
    const existing = await prisma.integration_deliveries.findFirst({
      where: {
        integration_id: integration.id,
        outbox_id: outboxRow.id
      }
    });

    if (existing) {
      if (existing.status === 'PENDING' || existing.status === 'PROCESSING') {
        if (existing.lock_expires_at && existing.lock_expires_at <= now) {
          await prisma.integration_deliveries.update({
            where: { id: existing.id },
            data: {
              status: 'PENDING',
              lock_owner: null,
              lock_expires_at: null
            }
          });
        }
        return existing;
      }
      return existing;
    }

    try {
      return await prisma.integration_deliveries.create({
        data: {
          integration_id: integration.id,
          restaurant_id: integration.restaurant_id,
          location_id: integration.location_id,
          outbox_id: outboxRow.id,
          event_type: outboxRow.event_type,
          event_version: 1,
          idempotency_key: idempotencyKey,
          correlation_id: correlationId,
          status: 'PENDING',
          attempt_count: 0,
          available_at: new Date(),
          lock_owner: null,
          lock_expires_at: null
        }
      });
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const retryExisting = await prisma.integration_deliveries.findFirst({
          where: {
            integration_id: integration.id,
            outbox_id: outboxRow.id
          }
        });
        return retryExisting;
      }
      throw error;
    }
  }

  private async processDelivery(delivery: any, integration: any, connector: FireFlowConnector, outboxRow: any, correlationId: string, idempotencyKey: string): Promise<void> {
    const claimed = await this.claimDelivery(delivery.id);
    if (!claimed) return;

    try {
      const context: IntegrationContext = {
        integrationId: integration.id,
        restaurantId: integration.restaurant_id,
        locationId: integration.location_id || undefined,
        correlationId,
        idempotencyKey,
        source: 'OUTBOX_DISPATCHER'
      };

      const request: ConnectorRequest = {
        eventType: outboxRow.event_type,
        eventVersion: 1,
        payload: outboxRow.payload,
        context
      };

      const timeoutPromise = new Promise<ConnectorResult>((resolve) => {
        setTimeout(() => {
          resolve({
            outcome: 'RETRYABLE_FAILURE',
            errorCode: 'TIMEOUT',
            errorMessage: `Connector ${connector.type} timed out after ${DEFAULT_TIMEOUT_MS}ms`
          });
        }, DEFAULT_TIMEOUT_MS);
      });

      const result = await Promise.race([connector.send(request), timeoutPromise]);

      if (result.outcome === 'RETRYABLE_FAILURE') {
        await this.markFailed(delivery.id, result.errorMessage);
      } else {
        await this.completeDelivery(delivery.id, result);
      }
    } catch (error: any) {
      const sanitizedError = this.sanitizeError(error);
      await this.markFailed(delivery.id, sanitizedError);
    }
  }

  private async claimDelivery(deliveryId: string): Promise<boolean> {
    const now = new Date();
    const leaseExpiry = new Date(Date.now() + LEASE_DURATION_MS);

    const claimed = await prisma.integration_deliveries.updateMany({
      where: {
        id: deliveryId,
        OR: [
          {
            status: 'PENDING',
            OR: [
              { lock_expires_at: null },
              { lock_expires_at: { lte: now } }
            ]
          },
          {
            status: 'PROCESSING',
            lock_expires_at: { lte: now }
          }
        ]
      },
      data: {
        status: 'PROCESSING',
        lock_owner: this.instanceId,
        lock_expires_at: leaseExpiry,
        attempt_count: { increment: 1 },
        available_at: new Date()
      }
    });

    return claimed.count > 0;
  }

  private async completeDelivery(deliveryId: string, result: ConnectorResult): Promise<void> {
    try {
      const updateData: any = {
        lock_owner: null,
        lock_expires_at: null
      };

      switch (result.outcome) {
        case 'ACCEPTED':
        case 'COMPLETED':
          updateData.status = result.outcome;
          updateData.completed_at = new Date();
          updateData.external_reference = result.externalReference || null;
          break;
        case 'RETRYABLE_FAILURE':
          updateData.status = 'RETRYABLE_FAILURE';
          break;
        case 'UNKNOWN':
          updateData.status = 'UNKNOWN';
          break;
        case 'PERMANENT_FAILURE':
          updateData.status = 'DEAD_LETTER';
          updateData.last_error = result.errorMessage;
          break;
      }

      await prisma.integration_deliveries.update({
        where: { id: deliveryId, status: 'PROCESSING', lock_owner: this.instanceId },
        data: updateData
      });
    } catch (error: any) {
      if (!this.isNotFoundError(error)) {
        throw error;
      }
    }
  }

  private async markFailed(deliveryId: string, errorMessage: string): Promise<void> {
    const delivery = await prisma.integration_deliveries.findUnique({ where: { id: deliveryId } });
    if (!delivery || delivery.lock_owner !== this.instanceId) {
      return;
    }

    const attemptCount = delivery.attempt_count;
    const isDeadLetter = attemptCount >= MAX_ATTEMPTS;

    if (isDeadLetter) {
      try {
        await prisma.integration_deliveries.update({
          where: { id: deliveryId, status: 'PROCESSING', lock_owner: this.instanceId },
          data: {
            status: 'DEAD_LETTER',
            attempt_count: attemptCount,
            last_error: errorMessage,
            lock_owner: null,
            lock_expires_at: null
          }
        });
      } catch (updateError: any) {
        if (!this.isNotFoundError(updateError)) {
          console.error(`[IntegrationDispatcher] Failed to mark dead letter ${deliveryId}:`, updateError);
        }
      }
    } else {
      const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attemptCount - 1);
      const nextAvailableAt = new Date(Date.now() + backoffMs);
      try {
        await prisma.integration_deliveries.update({
          where: { id: deliveryId, status: 'PROCESSING', lock_owner: this.instanceId },
          data: {
            status: 'PENDING',
            available_at: nextAvailableAt,
            last_error: errorMessage,
            lock_owner: null,
            lock_expires_at: nextAvailableAt
          }
        });
      } catch (updateError: any) {
        if (!this.isNotFoundError(updateError)) {
          console.error(`[IntegrationDispatcher] Failed to retry ${deliveryId}:`, updateError);
        }
      }
    }
  }

  private generateIdempotencyKey(integrationId: string, outboxId: string): string {
    return `integration:${integrationId}:outbox:${outboxId}`;
  }

  private generateCorrelationId(): string {
    return `corr-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  private sanitizeError(error: any): string {
    const message = error?.message || 'Unknown error';
    return message.length > 500 ? message.substring(0, 500) + '...' : message;
  }

  private isNotFoundError(error: any): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
  }
}
