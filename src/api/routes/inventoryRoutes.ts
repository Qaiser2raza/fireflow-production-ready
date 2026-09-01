/**
 * inventoryRoutes.ts
 * ──────────────────────────────────────────────────────────────────────────
 * Authenticated inventory API for Phase A/B capabilities.
 *
 * Auth:   protectedApiRouter applies authMiddleware + verifyLicensingMiddleware
 * Tenant: req.restaurantId is server-authoritative (from JWT)
 * RBAC:   requireRole(...) gates write operations
 *
 * Route conventions (matching coaRoutes.ts / supplierRoutes.ts):
 *   - req.restaurantId! used for all DB queries
 *   - No restaurant_id accepted from request body
 *   - Zod validation for write payloads
 *   - prisma.$transaction for multi-step operations
 *   - res.status(500).json({ error: e.message }) for errors
 * ──────────────────────────────────────────────────────────────────────────
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../shared/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { requireRole } from '../middleware/authMiddleware';
import { purchaseOrderReceiveService } from '../services/inventory/PurchaseOrderReceiveService';
import { stockCountService } from '../services/inventory/StockCountService';
import { wacProjectionService } from '../services/inventory/WACProjectionService';
import { inventoryConsumptionService } from '../services/inventory/InventoryConsumptionService';

const router = Router();

// ─── Schemas ────────────────────────────────────────────────────────────────

const createStockCountSchema = z.object({
    operationKey: z.string().min(1, 'operationKey is required'),
    countedBy: z.string().optional(),
});

const addStockCountLineSchema = z.object({
    inventoryItemId: z.string().uuid('inventoryItemId must be a valid UUID'),
    expectedQuantity: z.number().or(z.string()).or(z.instanceof(Decimal)),
    countedQuantity: z.number().or(z.string()).or(z.instanceof(Decimal)),
});

const receivePOSchema = z.object({
    quantity: z.number().positive('quantity must be positive'),
    operationKey: z.string().min(1, 'operationKey is required'),
});

// ─── READ ROUTES — accessible to CASHIER, MANAGER, ADMIN, SUPER_ADMIN ────────

/**
 * GET /api/inventory/items
 * List all inventory items for the tenant with current stock and WAC.
 */
router.get('/items', async (req, res) => {
    try {
        const restaurant_id = req.restaurantId!;

        const items = await prisma.inventory_items.findMany({
            where: { restaurant_id },
            orderBy: { name: 'asc' },
            select: {
                id: true,
                name: true,
                unit_of_measure: true,
                current_stock: true,
                minimum_stock: true,
                unit_cost: true,
                average_unit_cost: true,
                total_cost_basis: true,
                category: true,
                created_at: true,
                updated_at: true,
            }
        });

        const enriched = items.map(item => ({
            id: item.id,
            name: item.name,
            unitOfMeasure: item.unit_of_measure,
            currentStock: Number(item.current_stock),
            minimumStock: Number(item.minimum_stock),
            unitCost: Number(item.unit_cost),
            averageUnitCost: Number(item.average_unit_cost),
            totalCostBasis: Number(item.total_cost_basis),
            category: item.category,
            isNegative: Number(item.current_stock) < 0,
            createdAt: item.created_at,
            updatedAt: item.updated_at,
        }));

        res.json({ success: true, items: enriched });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/inventory/items/:id
 * Get a single inventory item with stock details.
 */
router.get('/items/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const restaurant_id = req.restaurantId!;

        const item = await prisma.inventory_items.findFirst({
            where: { id, restaurant_id },
        });

        if (!item) {
            return res.status(404).json({ error: 'Inventory item not found' });
        }

        res.json({
            success: true,
            item: {
                id: item.id,
                name: item.name,
                unitOfMeasure: item.unit_of_measure,
                currentStock: Number(item.current_stock),
                minimumStock: Number(item.minimum_stock),
                unitCost: Number(item.unit_cost),
                averageUnitCost: Number(item.average_unit_cost),
                totalCostBasis: Number(item.total_cost_basis),
                category: item.category,
                isNegative: Number(item.current_stock) < 0,
                createdAt: item.created_at,
                updatedAt: item.updated_at,
            }
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/inventory/items/:id/movements
 * Movement history for an inventory item, newest first.
 */
router.get('/items/:id/movements', async (req, res) => {
    try {
        const { id } = req.params;
        const restaurant_id = req.restaurantId!;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

        const item = await prisma.inventory_items.findFirst({
            where: { id, restaurant_id },
            select: { id: true, name: true }
        });

        if (!item) {
            return res.status(404).json({ error: 'Inventory item not found' });
        }

        const movements = await prisma.stock_movements.findMany({
            where: { inventory_item_id: id, restaurant_id },
            orderBy: { created_at: 'desc' },
            take: limit,
        });

        res.json({
            success: true,
            itemId: item.id,
            itemName: item.name,
            movements: movements.map(m => ({
                id: m.id,
                movementType: m.movement_type,
                quantity: Number(m.quantity),
                unitCost: Number(m.unit_cost),
                totalCost: Number(m.total_cost),
                referenceType: m.reference_type,
                referenceId: m.reference_id,
                createdAt: m.created_at,
            })),
            count: movements.length,
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/inventory/negative-stock
 * List all inventory items with negative current stock.
 */
router.get('/negative-stock', async (req, res) => {
    try {
        const restaurant_id = req.restaurantId!;

        const items = await prisma.inventory_items.findMany({
            where: {
                restaurant_id,
                current_stock: { lt: new Decimal(0) }
            },
            orderBy: { name: 'asc' },
        });

        res.json({
            success: true,
            items: items.map(item => ({
                id: item.id,
                name: item.name,
                unitOfMeasure: item.unit_of_measure,
                currentStock: Number(item.current_stock),
                minimumStock: Number(item.minimum_stock),
                averageUnitCost: Number(item.average_unit_cost),
                category: item.category,
                createdAt: item.created_at,
                updatedAt: item.updated_at,
            })),
            count: items.length,
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/inventory/items/:id/wac
 * Recalculate and return the current WAC for an item.
 */
router.get('/items/:id/wac', async (req, res) => {
    try {
        const { id } = req.params;
        const restaurant_id = req.restaurantId!;

        const item = await prisma.inventory_items.findFirst({
            where: { id, restaurant_id },
            select: { id: true, name: true, average_unit_cost: true }
        });

        if (!item) {
            return res.status(404).json({ error: 'Inventory item not found' });
        }

        const projection = await wacProjectionService.recalcWAC(id, restaurant_id);

        res.json({
            success: true,
            itemId: item.id,
            itemName: item.name,
            averageUnitCost: Number(projection.averageUnitCost),
            currentQuantity: Number(projection.currentQuantity),
            totalCostBasis: Number(projection.totalCostBasis),
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/inventory/po-lines
 * List PO lines that have remaining quantity to receive.
 * Returns lines with their inventory item name for UI selection.
 */
router.get('/po-lines', async (req, res) => {
    try {
        const restaurant_id = req.restaurantId!;

        const allLines = await prisma.purchase_order_items.findMany({
            where: { purchase_orders: { restaurant_id } },
            include: {
                inventory_items: { select: { id: true, name: true, unit_of_measure: true, current_stock: true, average_unit_cost: true } },
                purchase_orders: { select: { id: true, po_number: true, supplier_id: true, status: true } },
            },
            orderBy: { purchase_order_id: 'desc' },
        });

        const lines = allLines.filter((line: any) => {
            const ordered = Number(line.quantity_ordered);
            const received = Number(line.quantity_received);
            return received < ordered;
        });

        const enriched = lines.map((line: any) => {
            const item = line.inventory_items;
            const po = line.purchase_orders;
            const ordered = Number(line.quantity_ordered);
            const received = Number(line.quantity_received);
            return {
                id: line.id,
                purchase_order_id: line.purchase_order_id,
                po_number: po?.po_number,
                po_status: po?.status,
                supplier_id: po?.supplier_id,
                inventory_item_id: line.inventory_item_id,
                inventory_item_name: item?.name,
                unit_of_measure: item?.unit_of_measure,
                current_stock: item ? Number(item.current_stock) : null,
                average_unit_cost: item ? Number(item.average_unit_cost) : null,
                quantity_ordered: ordered,
                quantity_received: received,
                quantity_remaining: Math.max(0, ordered - received),
                unit_price: Number(line.unit_price),
                total_price: Number(line.total_price),
            };
        });

        res.json({ success: true, poLines: enriched });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ─── MANAGER ROUTES — MANAGER, ADMIN, SUPER_ADMIN only ─────────────────────

/**
 * POST /api/inventory/receive/:poLineId
 * Receive stock against a purchase order line.
 * Triggers: stock movement + WAC recalculation.
 */
router.post(
    '/receive/:poLineId',
    requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'),
    async (req, res) => {
        try {
            const { poLineId } = req.params;
            const parsed = receivePOSchema.safeParse(req.body);

            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Validation failed' });
            }

            const { quantity, operationKey } = parsed.data;
            const restaurantId = req.restaurantId!;
            const staffId = req.staffId!;

            const result = await purchaseOrderReceiveService.receivePOLine({
                restaurantId,
                poLineId,
                quantity: new Decimal(quantity),
                operationKey,
                createdBy: staffId,
            });

            res.json({
                success: true,
                movement: {
                    id: result.movement.id,
                    quantity: Number(result.movement.quantity),
                    unitCost: Number(result.movement.unitCost),
                    totalCost: Number(result.movement.totalCost),
                },
                poLine: result.poLine,
                isFullReceipt: result.isFullReceipt,
            });
        } catch (e: any) {
            if (e.message?.includes('not found') || e.message?.includes('does not belong')) {
                return res.status(404).json({ error: e.message });
            }
            res.status(400).json({ error: e.message });
        }
    }
);

/**
 * POST /api/inventory/counts
 * Create a new stock count session.
 */
router.post(
    '/counts',
    requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'),
    async (req, res) => {
        try {
            const parsed = createStockCountSchema.safeParse(req.body);

            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Validation failed' });
            }

            const { operationKey, countedBy } = parsed.data;
            const restaurantId = req.restaurantId!;
            const staffId = req.staffId!;

            const result = await stockCountService.createStockCount({
                restaurantId,
                operationKey,
                countedBy: countedBy || staffId,
            });

            res.status(201).json({ success: true, stockCount: result });
        } catch (e: any) {
            if (e.code === 'P2002') {
                return res.status(409).json({ error: e.message });
            }
            res.status(400).json({ error: e.message });
        }
    }
);

/**
 * PATCH /api/inventory/counts/:id/lines
 * Add or update a line on an open stock count.
 */
router.patch(
    '/counts/:id/lines',
    requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'),
    async (req, res) => {
        try {
            const { id } = req.params;
            const parsed = addStockCountLineSchema.safeParse(req.body);

            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Validation failed' });
            }

            const { inventoryItemId, expectedQuantity, countedQuantity } = parsed.data;

            const line = await stockCountService.addOrUpdateCountLine({
                stockCountId: id,
                inventoryItemId,
                expectedQuantity: new Decimal(expectedQuantity.toString()),
                countedQuantity: new Decimal(countedQuantity.toString()),
            });

            res.json({ success: true, line: {
                id: line.id,
                stockCountId: line.stockCountId,
                inventoryItemId: line.inventoryItemId,
                expectedQuantity: Number(line.expectedQuantity),
                countedQuantity: Number(line.countedQuantity),
                createdAt: line.createdAt,
            } });
        } catch (e: any) {
            if (e.message?.includes('not found')) {
                return res.status(404).json({ error: e.message });
            }
            res.status(400).json({ error: e.message });
        }
    }
);

/**
 * DELETE /api/inventory/counts/:id/lines/:lineId
 * Remove a line from an open stock count.
 */
router.delete(
    '/counts/:id/lines/:lineId',
    requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'),
    async (req, res) => {
        try {
            const { id, lineId } = req.params;
            const restaurantId = req.restaurantId!;

            const count = await prisma.stock_counts.findFirst({
                where: { id, restaurant_id: restaurantId }
            });

            if (!count) {
                return res.status(404).json({ error: 'Stock count not found' });
            }

            if (count.status !== 'OPEN') {
                return res.status(400).json({ error: 'Cannot remove lines from a non-OPEN stock count' });
            }

            const line = await prisma.stock_count_lines.findFirst({
                where: { id: lineId, stock_count_id: id }
            });

            if (!line) {
                return res.status(404).json({ error: 'Count line not found' });
            }

            await prisma.stock_count_lines.delete({ where: { id: lineId } });

            res.json({ success: true });
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    }
);

/**
 * POST /api/inventory/counts/:id/finalize
 * Finalize a stock count. Creates adjustment movements for non-zero variances.
 * Uses CAS to prevent concurrent finalization.
 */
router.post(
    '/counts/:id/finalize',
    requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'),
    async (req, res) => {
        try {
            const { id } = req.params;
            const restaurantId = req.restaurantId!;
            const staffId = req.staffId!;

            const result = await stockCountService.finalizeStockCount({
                stockCountId: id,
                restaurantId,
                finalizedBy: staffId,
            });

            res.json({
                success: true,
                stockCount: result.stockCount,
                adjustments: result.adjustments.map(a => ({
                    inventoryItemId: a.inventoryItemId,
                    inventoryItemName: a.inventoryItemName,
                    expectedQuantity: Number(a.expectedQuantity),
                    countedQuantity: Number(a.countedQuantity),
                    difference: Number(a.difference),
                    movementId: a.movement?.id || null,
                    movementQuantity: a.movement ? Number(a.movement.quantity) : null,
                })),
            });
        } catch (e: any) {
            if (e.message?.includes('not found')) {
                return res.status(404).json({ error: e.message });
            }
            if (e.message?.includes('already finalized') || e.message?.includes('not in OPEN state') || e.message?.includes('CAS')) {
                return res.status(409).json({ error: e.message });
            }
            res.status(400).json({ error: e.message });
        }
    }
);

/**
 * GET /api/inventory/counts/:id
 * Get a stock count with its lines.
 */
router.get('/counts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const restaurantId = req.restaurantId!;

        const count = await prisma.stock_counts.findFirst({
            where: { id, restaurant_id: restaurantId },
            include: {
                stock_count_lines: {
                    include: { inventory_items: true },
                    orderBy: { created_at: 'asc' }
                }
            }
        });

        if (!count) {
            return res.status(404).json({ error: 'Stock count not found' });
        }

        res.json({
            success: true,
            stockCount: {
                id: count.id,
                status: count.status,
                countedBy: count.counted_by,
                finalizedBy: count.finalized_by,
                finalizedAt: count.finalized_at,
                operationKey: count.operation_key,
                createdAt: count.created_at,
                lines: count.stock_count_lines.map(l => ({
                    id: l.id,
                    inventoryItemId: l.inventory_item_id,
                    inventoryItemName: l.inventory_items?.name,
                    expectedQuantity: Number(l.expected_quantity),
                    countedQuantity: Number(l.counted_quantity),
                    createdAt: l.created_at,
                }))
            }
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/inventory/counts
 * List stock counts for the tenant.
 */
router.get('/counts', async (req, res) => {
    try {
        const restaurantId = req.restaurantId!;
        const status = req.query.status as string | undefined;
        const take = Math.min(parseInt(req.query.limit as string) || 20, 100);

        const where: any = { restaurant_id: restaurantId };
        if (status) where.status = status;

        const counts = await prisma.stock_counts.findMany({
            where,
            orderBy: { created_at: 'desc' },
            take,
            select: {
                id: true,
                status: true,
                counted_by: true,
                finalized_by: true,
                finalized_at: true,
                operation_key: true,
                created_at: true,
            }
        });

        res.json({
            success: true,
            stockCounts: counts.map(c => ({
                id: c.id,
                status: c.status,
                countedBy: c.counted_by,
                finalizedBy: c.finalized_by,
                finalizedAt: c.finalized_at,
                operationKey: c.operation_key,
                createdAt: c.created_at,
            }))
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/inventory/orders/:orderId/consume
 * Administrative/manual inventory consumption trigger.
 * Canonical production path: Order SERVED → InventoryConsumptionService → COGS journal.
 * This endpoint is for manual/administrative recovery only.
 */
router.post(
    '/orders/:orderId/consume',
    requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'),
    async (req, res) => {
        try {
            const { orderId } = req.params;
            const restaurantId = req.restaurantId!;

            const order = await prisma.orders.findFirst({
                where: { id: orderId, restaurant_id: restaurantId },
            });

            if (!order) {
                return res.status(404).json({ error: 'Order not found' });
            }

            const result = await inventoryConsumptionService.consumeOrderOnServed({
                orderId,
                restaurantId,
            });

            res.json({
                success: true,
                totalCogs: Number(result.totalCogs),
                consumedItems: result.consumedItems.map(item => ({
                    inventoryItemId: item.inventoryItemId,
                    inventoryItemName: item.inventoryItemName,
                    quantityConsumed: Number(item.quantityConsumed),
                    unitCost: Number(item.unitCost),
                    totalCost: Number(item.totalCost),
                })),
                movements: result.movements.map(m => ({
                    id: m.id,
                    quantity: Number(m.quantity),
                    unitCost: Number(m.unitCost),
                    totalCost: Number(m.totalCost),
                })),
            });
        } catch (e: any) {
            if (e.message?.includes('not found')) {
                return res.status(404).json({ error: e.message });
            }
            res.status(400).json({ error: e.message });
        }
    }
);

export default router;
