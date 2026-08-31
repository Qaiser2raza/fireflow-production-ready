import { prisma } from '../../../shared/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { StockMovementService, StockMovementResult } from './StockMovementService';

export type StockCountStatus = 'OPEN' | 'FINALIZING' | 'CLOSED';

export interface CreateStockCountParams {
    restaurantId: string;
    countedBy?: string;
    operationKey: string;
}

export interface StockCountResult {
    id: string;
    restaurantId: string;
    status: StockCountStatus;
    countedBy: string | null;
    finalizedBy: string | null;
    finalizedAt: Date | null;
    operationKey: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateStockCountLineParams {
    stockCountId: string;
    inventoryItemId: string;
    expectedQuantity: Decimal | number | string;
    countedQuantity: Decimal | number | string;
}

export interface StockCountLineResult {
    id: string;
    stockCountId: string;
    inventoryItemId: string;
    expectedQuantity: Decimal;
    countedQuantity: Decimal;
    createdAt: Date;
}

export interface FinalizeStockCountParams {
    stockCountId: string;
    restaurantId: string;
    finalizedBy: string;
}

export interface ReconciliationResult {
    stockCount: StockCountResult;
    adjustments: Array<{
        inventoryItemId: string;
        inventoryItemName: string;
        expectedQuantity: Decimal;
        countedQuantity: Decimal;
        difference: Decimal;
        movement: StockMovementResult | null;
    }>;
}

export class StockCountService {
    static async createStockCount(params: CreateStockCountParams, tx?: any): Promise<StockCountResult> {
        const db = tx || prisma;

        if (!params.restaurantId) {
            throw new Error('restaurantId is required');
        }
        if (!params.operationKey) {
            throw new Error('operationKey is required');
        }

        const existing = await db.stock_counts.findFirst({
            where: { restaurant_id: params.restaurantId, operation_key: params.operationKey }
        });

        if (existing) {
            throw new Error(`Stock count with operationKey '${params.operationKey}' already exists for this restaurant`);
        }

        const stockCount = await db.stock_counts.create({
            data: {
                restaurant_id: params.restaurantId,
                status: 'OPEN',
                counted_by: params.countedBy || null,
                operation_key: params.operationKey,
                created_at: new Date(),
                updated_at: new Date()
            }
        });

        return this.formatStockCount(stockCount);
    }

    static async getStockCountById(id: string, restaurantId: string, tx?: any): Promise<StockCountResult | null> {
        const db = tx || prisma;

        const stockCount = await db.stock_counts.findFirst({
            where: { id, restaurant_id: restaurantId }
        });

        return stockCount ? this.formatStockCount(stockCount) : null;
    }

    static async getStockCounts(restaurantId: string, status?: StockCountStatus, tx?: any): Promise<StockCountResult[]> {
        const db = tx || prisma;

        const where: any = { restaurant_id: restaurantId };
        if (status) {
            where.status = status;
        }

        const stockCounts = await db.stock_counts.findMany({
            where,
            orderBy: { created_at: 'desc' }
        });

        return stockCounts.map(this.formatStockCount);
    }

    static async addOrUpdateCountLine(params: CreateStockCountLineParams, tx?: any): Promise<StockCountLineResult> {
        const db = tx || prisma;

        if (!params.stockCountId) {
            throw new Error('stockCountId is required');
        }
        if (!params.inventoryItemId) {
            throw new Error('inventoryItemId is required');
        }
        if (params.expectedQuantity === undefined || params.expectedQuantity === null) {
            throw new Error('expectedQuantity is required');
        }
        if (params.countedQuantity === undefined || params.countedQuantity === null) {
            throw new Error('countedQuantity is required');
        }

        const expectedQuantity = new Decimal(params.expectedQuantity.toString());
        const countedQuantity = new Decimal(params.countedQuantity.toString());

        if (expectedQuantity.lt(0) || countedQuantity.lt(0)) {
            throw new Error('Quantities cannot be negative');
        }

        const stockCount = await db.stock_counts.findUnique({
            where: { id: params.stockCountId }
        });

        if (!stockCount) {
            throw new Error('Stock count not found');
        }

        if (stockCount.status !== 'OPEN') {
            throw new Error('Cannot add lines to a non-OPEN stock count');
        }

        const existingLine = await db.stock_count_lines.findFirst({
            where: { stock_count_id: params.stockCountId, inventory_item_id: params.inventoryItemId }
        });

        if (existingLine) {
            const updated = await db.stock_count_lines.update({
                where: { id: existingLine.id },
                data: {
                    expected_quantity: expectedQuantity,
                    counted_quantity: countedQuantity
                }
            });
            return this.formatStockCountLine(updated);
        }

        const line = await db.stock_count_lines.create({
            data: {
                stock_count_id: params.stockCountId,
                inventory_item_id: params.inventoryItemId,
                expected_quantity: expectedQuantity,
                counted_quantity: countedQuantity
            }
        });

        return this.formatStockCountLine(line);
    }

    static async getCountLines(stockCountId: string, restaurantId: string, tx?: any): Promise<StockCountLineResult[]> {
        const db = tx || prisma;

        const stockCount = await db.stock_counts.findFirst({
            where: { id: stockCountId, restaurant_id: restaurantId }
        });

        if (!stockCount) {
            throw new Error('Stock count not found or does not belong to this restaurant');
        }

        const lines = await db.stock_count_lines.findMany({
            where: { stock_count_id: stockCountId },
            include: { inventory_items: true }
        });

        return lines.map(this.formatStockCountLine);
    }

    static async finalizeStockCount(params: FinalizeStockCountParams, tx?: any): Promise<ReconciliationResult> {
        if (!params.stockCountId) {
            throw new Error('stockCountId is required');
        }
        if (!params.restaurantId) {
            throw new Error('restaurantId is required');
        }
        if (!params.finalizedBy) {
            throw new Error('finalizedBy is required');
        }

        if (tx) {
            return await this.finalizeStockCountInTx(params, tx);
        }

        return await prisma.$transaction(async (txInner: any) => {
            return await this.finalizeStockCountInTx(params, txInner);
        }, {
            isolationLevel: 'Serializable' as any
        });
    }

    private static async finalizeStockCountInTx(params: FinalizeStockCountParams, db: any): Promise<ReconciliationResult> {
        const stockCount = await db.stock_counts.findFirst({
            where: { id: params.stockCountId, restaurant_id: params.restaurantId }
        });

        if (!stockCount) {
            throw new Error('Stock count not found or does not belong to this restaurant');
        }

        if (stockCount.status !== 'OPEN') {
            throw new Error('Stock count is not in OPEN state');
        }

        const lines = await db.stock_count_lines.findMany({
            where: { stock_count_id: params.stockCountId },
            include: { inventory_items: true }
        });

        if (lines.length === 0) {
            throw new Error('Cannot finalize stock count with no lines');
        }

        const updateResult = await db.stock_counts.updateMany({
            where: { id: params.stockCountId, status: 'OPEN' },
            data: {
                status: 'CLOSED',
                finalized_by: params.finalizedBy,
                finalized_at: new Date(),
                updated_at: new Date()
            }
        });

        if (updateResult.count === 0) {
            throw new Error('Stock count is not in OPEN state (race condition)');
        }

        const finalizedCount = await db.stock_counts.findFirst({
            where: { id: params.stockCountId }
        });

        const adjustments = [];

        for (const line of lines) {
            const expected = new Decimal(line.expected_quantity);
            const counted = new Decimal(line.counted_quantity);
            const difference = counted.minus(expected);

            if (difference.isZero()) {
                adjustments.push({
                    inventoryItemId: line.inventory_item_id,
                    inventoryItemName: line.inventory_items?.name || 'Unknown',
                    expectedQuantity: expected,
                    countedQuantity: counted,
                    difference: new Decimal(0),
                    movement: null
                });
                continue;
            }

            const operationKey = `ADJ-${params.stockCountId}-${line.inventory_item_id}`;
            const existingMovement = await db.stock_movements.findFirst({
                where: { operation_key: operationKey, restaurant_id: params.restaurantId }
            });

            let movement: StockMovementResult | null = null;

            if (!existingMovement) {
                movement = await StockMovementService.createMovement({
                    restaurantId: params.restaurantId,
                    inventoryItemId: line.inventory_item_id,
                    movementType: 'ADJUSTMENT',
                    quantity: difference.abs(),
                    unitCost: line.inventory_items?.unit_cost || 0,
                    referenceType: 'STOCK_COUNT',
                    referenceId: params.stockCountId,
                    stockCountLineId: line.id,
                    operationKey,
                    createdBy: params.finalizedBy
                }, db);
            } else {
                movement = StockMovementService['formatMovement'](existingMovement);
            }

            adjustments.push({
                inventoryItemId: line.inventory_item_id,
                inventoryItemName: line.inventory_items?.name || 'Unknown',
                expectedQuantity: expected,
                countedQuantity: counted,
                difference,
                movement
            });
        }

        return {
            stockCount: this.formatStockCount(finalizedCount),
            adjustments
        };
    }

    static async reOpenStockCount(stockCountId: string, restaurantId: string, tx?: any): Promise<StockCountResult> {
        const db = tx || prisma;

        const stockCount = await db.stock_counts.findFirst({
            where: { id: stockCountId, restaurant_id: restaurantId }
        });

        if (!stockCount) {
            throw new Error('Stock count not found or does not belong to this restaurant');
        }

        if (stockCount.status !== 'CLOSED') {
            throw new Error('Only CLOSED stock counts can be reopened');
        }

        const movements = await db.stock_movements.findMany({
            where: {
                stock_count_line_id: {
                    in: (await db.stock_count_lines.findMany({
                        where: { stock_count_id: stockCountId },
                        select: { id: true }
                    })).map((l: { id: string }) => l.id)
                },
                restaurant_id: restaurantId
            }
        });

        if (movements.length > 0) {
            throw new Error('Cannot reopen stock count that has generated adjustment movements. Create a new stock count instead.');
        }

        const reopened = await db.stock_counts.update({
            where: { id: stockCountId },
            data: {
                status: 'OPEN',
                finalized_by: null,
                finalized_at: null,
                updated_at: new Date()
            }
        });

        return this.formatStockCount(reopened);
    }

    private static formatStockCount(sc: any): StockCountResult {
        return {
            id: sc.id,
            restaurantId: sc.restaurant_id,
            status: sc.status,
            countedBy: sc.counted_by,
            finalizedBy: sc.finalized_by,
            finalizedAt: sc.finalized_at,
            operationKey: sc.operation_key,
            createdAt: sc.created_at,
            updatedAt: sc.updated_at
        };
    }

    private static formatStockCountLine(line: any): StockCountLineResult {
        return {
            id: line.id,
            stockCountId: line.stock_count_id,
            inventoryItemId: line.inventory_item_id,
            expectedQuantity: line.expected_quantity,
            countedQuantity: line.counted_quantity,
            createdAt: line.created_at
        };
    }
}

export const stockCountService = StockCountService;