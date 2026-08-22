import { prisma } from '../../../shared/lib/prisma';
import { FiscalRegistry } from './FiscalRegistry';
import { logger, LogLevel } from '../../../shared/lib/logger';
import crypto from 'crypto';

const FISCAL_EVENT_TYPES = ['FISCAL_DOCUMENT_REQUESTED'];
const BATCH_SIZE = 50;
const POLL_INTERVAL_MS = 1000;

export class FiscalDeliveryService {
  private static instance: FiscalDeliveryService | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly processedDeliveries: Set<string> = new Set();

  private constructor() {}

  static getInstance(): FiscalDeliveryService {
    if (!FiscalDeliveryService.instance) {
      FiscalDeliveryService.instance = new FiscalDeliveryService();
    }
    return FiscalDeliveryService.instance;
  }

  start(): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(async () => {
      await this.processCompletedDeliveries();
    }, POLL_INTERVAL_MS);

    console.log(`[FiscalDeliveryService] Started (interval: ${POLL_INTERVAL_MS}ms)`);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log(`[FiscalDeliveryService] Stopped`);
    }
  }

  private async processCompletedDeliveries(): Promise<void> {
    try {
      const completedDeliveries = await prisma.integration_deliveries.findMany({
        where: {
          event_type: { in: FISCAL_EVENT_TYPES },
          status: { in: ['COMPLETED', 'DEAD_LETTER', 'UNKNOWN'] },
          id: { not: { in: Array.from(this.processedDeliveries) } },
        },
        orderBy: { updated_at: 'asc' },
        take: BATCH_SIZE,
      });

      if (completedDeliveries.length === 0) return;

      for (const delivery of completedDeliveries) {
        await this.processDelivery(delivery);
        this.processedDeliveries.add(delivery.id);
      }
    } catch (error: any) {
      logger.log({
        level: LogLevel.ERROR,
        service: 'fiscal-delivery',
        action: 'process_completed_deliveries',
        error: { message: error.message },
      });
    }
  }

  private async processDelivery(delivery: any): Promise<void> {
    const payload = delivery.outbox?.payload as any;
    if (!payload || !payload.fiscalDocumentId) {
      return;
    }

    const fiscalDocument = await prisma.fiscal_documents.findFirst({
      where: {
        id: payload.fiscalDocumentId,
        restaurant_id: delivery.restaurant_id,
      },
    });

    if (!fiscalDocument) {
      logger.log({
        level: LogLevel.WARN,
        service: 'fiscal-delivery',
        action: 'fiscal_document_not_found',
        metadata: { deliveryId: delivery.id, fiscalDocumentId: payload.fiscalDocumentId },
      });
      return;
    }

    if (fiscalDocument.status !== 'PENDING') {
      return;
    }

    const registry = FiscalRegistry.getInstance();
    const provider = registry.get(fiscalDocument.provider_type);
    if (!provider) {
      return;
    }

    const providerIdempotencyKey = `fiscal:${fiscalDocument.id}:attempt:${Date.now()}`;

    const attempt = await prisma.fiscal_attempts.create({
      data: {
        fiscal_document_id: fiscalDocument.id,
        restaurant_id: delivery.restaurant_id,
        provider_type: fiscalDocument.provider_type,
        status: 'PENDING',
        idempotency_key: providerIdempotencyKey,
        correlation_id: payload.correlationId || crypto.randomUUID(),
      },
    });

    let documentStatus: string;
    let attemptStatus: string;
    let externalReference: string | null = null;
    let lastError: string | null = null;
    let issuedAt: Date | null = null;

    switch (delivery.status) {
      case 'COMPLETED':
        documentStatus = 'ISSUED';
        attemptStatus = 'COMPLETED';
        externalReference = delivery.external_reference;
        issuedAt = new Date();
        break;
      case 'DEAD_LETTER':
        documentStatus = 'FAILED';
        attemptStatus = 'DEAD_LETTER';
        lastError = delivery.last_error || 'Permanent failure from connector';
        break;
      case 'UNKNOWN':
        documentStatus = 'UNKNOWN';
        attemptStatus = 'UNKNOWN';
        lastError = delivery.last_error || 'Ambiguous result from connector';
        break;
      default:
        return;
    }

    await prisma.fiscal_documents.update({
      where: { id: fiscalDocument.id },
      data: {
        status: documentStatus as any,
        provider_reference: externalReference,
        issued_at: issuedAt,
        updated_at: new Date(),
      },
    });

    await prisma.fiscal_attempts.update({
      where: { id: attempt.id },
      data: {
        status: attemptStatus as any,
        external_reference: externalReference,
        last_error: lastError,
        completed_at: new Date(),
      },
    });
  }
}
