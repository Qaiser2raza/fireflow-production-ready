import { Prisma } from '@prisma/client';
import { prisma } from '../../../shared/lib/prisma';
import { FiscalRegistry } from './FiscalRegistry';
import { FiscalExecutionContext } from './FiscalTypes';
import crypto from 'crypto';

export class FiscalDocumentService {
  private static instance: FiscalDocumentService | null = null;

  private constructor() {}

  static getInstance(): FiscalDocumentService {
    if (!FiscalDocumentService.instance) {
      FiscalDocumentService.instance = new FiscalDocumentService();
    }
    return FiscalDocumentService.instance;
  }

  async requestDocument(orderId: string, context: FiscalExecutionContext): Promise<any> {
    const order = await prisma.orders.findFirst({
      where: {
        id: orderId,
        restaurant_id: context.restaurantId,
      },
    });

    if (!order) {
      throw new Error('Order not found or unauthorized');
    }

    if (order.status !== 'CLOSED') {
      throw new Error(`Order is not CLOSED: ${order.status}`);
    }

    if (order.payment_status !== 'PAID') {
      throw new Error(`Order payment status is not PAID: ${order.payment_status}`);
    }

    const providerType = 'MOCK_FISCAL';
    const registry = FiscalRegistry.getInstance();
    const provider = registry.get(providerType);
    if (!provider) {
      throw new Error(`Fiscal provider not registered: ${providerType}`);
    }

    const existingDocument = await prisma.fiscal_documents.findFirst({
      where: {
        restaurant_id: context.restaurantId,
        order_id: orderId,
        document_type: 'INVOICE',
      },
    });

    if (existingDocument) {
      return existingDocument;
    }

    const subtotal = this.calculateSubtotal(order);
    const taxTotal = this.calculateTaxTotal(order);
    const grandTotal = subtotal.plus(taxTotal);

    const fiscalDocument = await prisma.fiscal_documents.create({
      data: {
        restaurant_id: context.restaurantId,
        order_id: orderId,
        document_type: 'INVOICE',
        currency: 'PKR',
        subtotal,
        tax_total: taxTotal,
        grand_total: grandTotal,
        status: 'PENDING',
        provider_type: providerType,
        correlation_id: context.correlationId,
      },
    });

    const providerIdempotencyKey = `fiscal:${fiscalDocument.id}:attempt:${crypto.randomUUID()}`;

    await prisma.fiscal_attempts.create({
      data: {
        fiscal_document_id: fiscalDocument.id,
        restaurant_id: context.restaurantId,
        provider_type: providerType,
        status: 'PENDING',
        idempotency_key: providerIdempotencyKey,
        correlation_id: context.correlationId,
      },
    });

    await prisma.outbox.create({
      data: {
        restaurant_id: context.restaurantId,
        event_type: 'FISCAL_DOCUMENT_REQUESTED',
        aggregate_type: 'fiscal_documents',
        aggregate_id: fiscalDocument.id,
        payload: {
          fiscalDocumentId: fiscalDocument.id,
          orderId: order.id,
          restaurantId: context.restaurantId,
          documentType: 'INVOICE',
          currency: 'PKR',
          subtotal: Number(subtotal),
          taxTotal: Number(taxTotal),
          grandTotal: Number(grandTotal),
          correlationId: context.correlationId,
          requestedAt: new Date().toISOString(),
        },
      },
    });

    return fiscalDocument;
  }

  async reconcileUnknown(fiscalDocumentId: string, context: FiscalExecutionContext, resolvedOutcome: 'ISSUED' | 'FAILED'): Promise<void> {
    const fiscalDocument = await prisma.fiscal_documents.findFirst({
      where: {
        id: fiscalDocumentId,
        restaurant_id: context.restaurantId,
      },
    });

    if (!fiscalDocument) {
      throw new Error('Fiscal document not found or unauthorized');
    }

    if (fiscalDocument.status !== 'UNKNOWN') {
      throw new Error(`Fiscal document is not UNKNOWN: ${fiscalDocument.status}`);
    }

    await prisma.fiscal_documents.update({
      where: { id: fiscalDocumentId },
      data: {
        status: resolvedOutcome,
        updated_at: new Date(),
      },
    });

    const attempts = await prisma.fiscal_attempts.findMany({
      where: { fiscal_document_id: fiscalDocumentId },
      orderBy: { created_at: 'desc' },
      take: 1,
    });

    if (attempts.length > 0) {
      await prisma.fiscal_attempts.update({
        where: { id: attempts[0].id },
        data: {
          status: resolvedOutcome === 'ISSUED' ? 'COMPLETED' : 'DEAD_LETTER',
          completed_at: new Date(),
          last_error: resolvedOutcome === 'ISSUED' ? null : 'Reconciled as FAILED',
        },
      });
    }
  }

  private calculateSubtotal(order: any): Prisma.Decimal {
    const items = Array.isArray(order.items) ? order.items : [];
    return items.reduce((sum: Prisma.Decimal, item: any) => {
      const price = Number(item.unit_price || item.price || 0);
      const qty = Number(item.quantity || 1);
      return sum.plus(new Prisma.Decimal(price * qty));
    }, new Prisma.Decimal(0));
  }

  private calculateTaxTotal(order: any): Prisma.Decimal {
    if (!order.tax) {
      return new Prisma.Decimal(0);
    }
    return new Prisma.Decimal(order.tax);
  }
}
