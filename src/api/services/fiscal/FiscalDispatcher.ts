import { prisma } from '../../../shared/lib/prisma';
import { FiscalRegistry } from './FiscalRegistry';
import { FiscalIssueRequest, FiscalProviderResult, FiscalExecutionContext } from './FiscalTypes';
import crypto from 'crypto';

const DEFAULT_TIMEOUT_MS = 10000;

export class FiscalDispatcher {
  private static instance: FiscalDispatcher | null = null;

  private constructor() {}

  static getInstance(): FiscalDispatcher {
    if (!FiscalDispatcher.instance) {
      FiscalDispatcher.instance = new FiscalDispatcher();
    }
    return FiscalDispatcher.instance;
  }

  async processOutbox(): Promise<void> {
    const unprocessed = await prisma.outbox.findMany({
      where: {
        event_type: 'FISCAL_DOCUMENT_REQUESTED',
        processed_at: null,
      },
      orderBy: {
        created_at: 'asc',
      },
      take: 50,
    });

    if (unprocessed.length === 0) return;

    for (const event of unprocessed) {
      await this.processFiscalEvent(event);
    }
  }

  private async processFiscalEvent(event: any): Promise<void> {
    const fiscalDocumentId = event.aggregate_id;
    const restaurantId = event.restaurant_id;

    const fiscalDocument = await prisma.fiscal_documents.findFirst({
      where: {
        id: fiscalDocumentId,
        restaurant_id: restaurantId,
      },
    });

    if (!fiscalDocument) {
      return;
    }

    const registry = FiscalRegistry.getInstance();
    const provider = registry.get(fiscalDocument.provider_type);
    if (!provider) {
      return;
    }

    const providerIdempotencyKey = `fiscal:${fiscalDocument.id}:attempt:${crypto.randomUUID()}`;
    const correlationId = crypto.randomUUID();

    const existingAttempt = await prisma.fiscal_attempts.findFirst({
      where: {
        fiscal_document_id: fiscalDocument.id,
        status: 'PENDING',
      },
    });

    let attempt;
    if (existingAttempt) {
      attempt = await prisma.fiscal_attempts.update({
        where: { id: existingAttempt.id },
        data: {
          status: 'PROCESSING',
          idempotency_key: providerIdempotencyKey,
          correlation_id: correlationId,
        },
      });
    } else {
      attempt = await prisma.fiscal_attempts.create({
        data: {
          fiscal_document_id: fiscalDocument.id,
          restaurant_id: restaurantId,
          provider_type: fiscalDocument.provider_type,
          status: 'PROCESSING',
          idempotency_key: providerIdempotencyKey,
          correlation_id: correlationId,
        },
      });
    }

    const context: FiscalExecutionContext = {
      fiscalDocumentId: fiscalDocument.id,
      restaurantId: fiscalDocument.restaurant_id,
      orderId: fiscalDocument.order_id,
      correlationId,
      idempotencyKey: providerIdempotencyKey,
      source: 'FISCAL_DISPATCHER',
    };

    const request: FiscalIssueRequest = {
      fiscalDocumentId: fiscalDocument.id,
      orderId: fiscalDocument.order_id,
      documentType: fiscalDocument.document_type,
      currency: fiscalDocument.currency,
      subtotal: Number(fiscalDocument.subtotal),
      taxTotal: Number(fiscalDocument.tax_total),
      grandTotal: Number(fiscalDocument.grand_total),
      context,
    };

    const timeoutPromise = new Promise<FiscalProviderResult>((resolve) => {
      setTimeout(() => {
        resolve({
          outcome: 'FAILED',
          errorCode: 'TIMEOUT',
          errorMessage: `Fiscal provider ${provider.type} timed out after ${DEFAULT_TIMEOUT_MS}ms`,
        });
      }, DEFAULT_TIMEOUT_MS);
    });

    let result: FiscalProviderResult;
    try {
      result = await Promise.race([provider.issueDocument(request), timeoutPromise]);
    } catch (error: any) {
      result = {
        outcome: 'FAILED',
        errorCode: 'PROVIDER_ERROR',
        errorMessage: error.message || 'Unknown provider error',
      };
    }

    await this.completeAttempt(attempt.id, fiscalDocument.id, result);
  }

  private async completeAttempt(attemptId: string, fiscalDocumentId: string, result: FiscalProviderResult): Promise<void> {
    const attemptUpdateData: any = {
      completed_at: new Date(),
    };

    if (result.outcome === 'ISSUED') {
      attemptUpdateData.status = 'COMPLETED';
      attemptUpdateData.external_reference = result.providerReference;
    } else if (result.outcome === 'FAILED') {
      attemptUpdateData.status = 'DEAD_LETTER';
      attemptUpdateData.last_error = result.errorMessage;
    } else {
      attemptUpdateData.status = 'UNKNOWN';
      attemptUpdateData.last_error = result.errorMessage;
    }

    await prisma.fiscal_attempts.update({
      where: { id: attemptId },
      data: attemptUpdateData,
    });

    const documentUpdateData: any = {
      updated_at: new Date(),
    };

    if (result.outcome === 'ISSUED') {
      documentUpdateData.status = 'ISSUED';
      documentUpdateData.provider_reference = result.providerReference;
      documentUpdateData.issued_at = result.issuedAt;
    } else if (result.outcome === 'FAILED') {
      documentUpdateData.status = 'FAILED';
    } else {
      documentUpdateData.status = 'UNKNOWN';
    }

    await prisma.fiscal_documents.update({
      where: { id: fiscalDocumentId },
      data: documentUpdateData,
    });
  }
}
