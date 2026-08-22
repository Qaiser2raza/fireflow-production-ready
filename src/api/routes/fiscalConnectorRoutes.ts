import { Router, Response } from 'express';
import { AuthenticatedFiscalConnectorRequest, fiscalConnectorAuthMiddleware } from '../middleware/fiscalConnectorAuthMiddleware';
import { FiscalDocumentService } from '../services/fiscal/FiscalDocumentService';
import { FiscalConnectorReconcileRequest, FiscalConnectorReconcileResponse } from '../services/fiscal/FiscalConnectorContract';
import { prisma } from '../../shared/lib/prisma';
import { logger } from '../../shared/lib/logger';
import crypto from 'crypto';

const router = Router();

router.post('/reconcile', fiscalConnectorAuthMiddleware, async (req: AuthenticatedFiscalConnectorRequest, res: Response) => {
  try {
    const reconcileRequest = req.body as FiscalConnectorReconcileRequest;
    const { fiscalDocumentId, outcome } = reconcileRequest;

    if (!fiscalDocumentId || !outcome) {
      res.status(400).json({ accepted: false, fiscalDocumentId, status: 'REJECTED', message: 'Missing fiscalDocumentId or outcome' });
      return;
    }

    if (outcome !== 'ISSUED' && outcome !== 'FAILED') {
      res.status(400).json({ accepted: false, fiscalDocumentId, status: 'REJECTED', message: `Invalid reconciliation outcome: ${outcome}. Must be ISSUED or FAILED.` });
      return;
    }

    const fiscalDocument = await prisma.fiscal_documents.findFirst({
      where: { id: fiscalDocumentId },
    });

    if (!fiscalDocument) {
      res.status(404).json({ accepted: false, fiscalDocumentId, status: 'NOT_FOUND', message: 'Fiscal document not found' });
      return;
    }

    if (fiscalDocument.status !== 'UNKNOWN') {
      res.status(409).json({ accepted: false, fiscalDocumentId, status: fiscalDocument.status, message: `Document is not UNKNOWN: ${fiscalDocument.status}` });
      return;
    }

    const service = FiscalDocumentService.getInstance();
    await service.reconcileUnknown(fiscalDocumentId, {
      fiscalDocumentId,
      restaurantId: fiscalDocument.restaurant_id,
      orderId: fiscalDocument.order_id,
      correlationId: req.fiscalConnectorAuth?.requestId || crypto.randomUUID(),
      idempotencyKey: req.fiscalConnectorAuth?.nonce || crypto.randomUUID(),
      source: 'FISCAL_CONNECTOR',
    }, outcome);

    res.status(200).json({
      accepted: true,
      fiscalDocumentId,
      status: 'RECONCILED',
      message: `Reconciled to ${outcome}`,
    } as FiscalConnectorReconcileResponse);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Fiscal connector reconcile failed');
    res.status(500).json({ accepted: false, fiscalDocumentId: req.body.fiscalDocumentId, status: 'ERROR', message: 'Internal server error' });
  }
});

router.get('/documents/:id', fiscalConnectorAuthMiddleware, async (req: AuthenticatedFiscalConnectorRequest, res: Response) => {
  try {
    const fiscalDocumentId = req.params.id;

    const fiscalDocument = await prisma.fiscal_documents.findFirst({
      where: { id: fiscalDocumentId },
    });

    if (!fiscalDocument) {
      res.status(404).json({ error: 'Fiscal document not found' });
      return;
    }

    res.status(200).json({
      id: fiscalDocument.id,
      restaurantId: fiscalDocument.restaurant_id,
      orderId: fiscalDocument.order_id,
      documentType: fiscalDocument.document_type,
      currency: fiscalDocument.currency,
      subtotal: Number(fiscalDocument.subtotal),
      taxTotal: Number(fiscalDocument.tax_total),
      grandTotal: Number(fiscalDocument.grand_total),
      status: fiscalDocument.status,
      providerType: fiscalDocument.provider_type,
      providerReference: fiscalDocument.provider_reference,
      issuedAt: fiscalDocument.issued_at,
      correlationId: fiscalDocument.correlation_id,
      createdAt: fiscalDocument.created_at,
      updatedAt: fiscalDocument.updated_at,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Fiscal connector document lookup failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
