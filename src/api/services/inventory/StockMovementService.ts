import { prisma } from '../../../shared/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

export type StockMovementType = 'RECEIVE' | 'ADJUSTMENT';

export interface CreateStockMovementParams {
    restaurantId: string;
    inventoryItemId: string;
    movementType: StockMovementType;
    quantity: Decimal | number | string;
    unitCost?: Decimal | number | string;
    referenceType: string;
    referenceId?: string;
    poLineId?: string;
    stockCountLineId?: string;
    operationKey: string;
    createdBy?: string;
}

export interface StockMovementResult {
    id: string;
    restaurantId: string;
    inventoryItemId: string;
    movementType: StockMovementType;
    quantity: Decimal;
    unitCost: Decimal;
    referenceType: string;
    referenceId: string | null;
    poLineId: string | null;
    stockCountLineId: string | null;
    operationKey: string;
    createdBy: string | null;
    createdAt: Date;
}

export class StockMovementService {
    private static readonly VALID_MOVEMENT_TYPES: StockMovementType[] = ['RECEIVE', 'ADJUSTMENT'];
    private static readonly VALID_REFERENCE_TYPES = ['PURCHASE_ORDER', 'STOCK_COUNT', 'MANUAL_ADJUSTMENT', 'RECIPE_USAGE', 'WASTE', 'TRANSFER'];

    static async createMovement(params: CreateStockMovementParams, tx?: any): Promise<StockMovementResult> {
        const db = tx || prisma;

        this.validateParams(params);

        await this.validateTenantOwnership(params.restaurantId, params.inventoryItemId, params.poLineId, params.stockCountLineId, db);

        await this.validateOperationKeyUniqueness(params.restaurantId, params.operationKey, db);

        const existingMovement = await db.stock_movements.findFirst({
            where: { operation_key: params.operationKey, restaurant_id: params.restaurantId }
        });

        if (existingMovement) {
            throw new Error(`Stock movement with operationKey '${params.operationKey}' already exists for this restaurant`);
        }

        const quantity = new Decimal(params.quantity.toString());
        const unitCost = new Decimal((params.unitCost || 0).toString());

        if (quantity.isZero()) {
            throw new Error('Stock movement quantity cannot be zero');
        }

        const movement = await db.stock_movements.create({
            data: {
                restaurant_id: params.restaurantId,
                inventory_item_id: params.inventoryItemId,
                movement_type: params.movementType,
                quantity,
                unit_cost: unitCost,
                reference_type: params.referenceType,
                reference_id: params.referenceId || null,
                po_line_id: params.poLineId || null,
                stock_count_line_id: params.stockCountLineId || null,
                operation_key: params.operationKey,
                created_by: params.createdBy || null,
                created_at: new Date(),
            }
        });

        return this.formatMovement(movement);
    }

    static async getMovementById(id: string, restaurantId: string, tx?: any): Promise<StockMovementResult | null> {
        const db = tx || prisma;

        const movement = await db.stock_movements.findFirst({
            where: { id, restaurant_id: restaurantId }
        });

        return movement ? this.formatMovement(movement) : null;
    }

    static async getMovementsByItem(inventoryItemId: string, restaurantId: string, tx?: any): Promise<StockMovementResult[]> {
        const db = tx || prisma;

        const movements = await db.stock_movements.findMany({
            where: { inventory_item_id: inventoryItemId, restaurant_id: restaurantId },
            orderBy: { created_at: 'desc' }
        });

        return movements.map(this.formatMovement);
    }

    static async getMovementsByReference(referenceType: string, referenceId: string, restaurantId: string, tx?: any): Promise<StockMovementResult[]> {
        const db = tx || prisma;

        const movements = await db.stock_movements.findMany({
            where: { reference_type: referenceType, reference_id: referenceId, restaurant_id: restaurantId },
            orderBy: { created_at: 'desc' }
        });

        return movements.map(this.formatMovement);
    }

    static async getMovementsByPOLine(poLineId: string, restaurantId: string, tx?: any): Promise<StockMovementResult[]> {
        const db = tx || prisma;

        const movements = await db.stock_movements.findMany({
            where: { po_line_id: poLineId, restaurant_id: restaurantId },
            orderBy: { created_at: 'desc' }
        });

        return movements.map(this.formatMovement);
    }

    static async getMovementsByStockCountLine(stockCountLineId: string, restaurantId: string, tx?: any): Promise<StockMovementResult[]> {
        const db = tx || prisma;

        const movements = await db.stock_movements.findMany({
            where: { stock_count_line_id: stockCountLineId, restaurant_id: restaurantId },
            orderBy: { created_at: 'desc' }
        });

        return movements.map(this.formatMovement);
    }

    private static validateParams(params: CreateStockMovementParams): void {
        if (!params.restaurantId) {
            throw new Error('restaurantId is required');
        }
        if (!params.inventoryItemId) {
            throw new Error('inventoryItemId is required');
        }
        if (!params.movementType) {
            throw new Error('movementType is required');
        }
        if (!this.VALID_MOVEMENT_TYPES.includes(params.movementType)) {
            throw new Error(`Invalid movementType: ${params.movementType}. Must be RECEIVE or ADJUSTMENT`);
        }
        if (params.quantity === undefined || params.quantity === null) {
            throw new Error('quantity is required');
        }
        if (!params.referenceType) {
            throw new Error('referenceType is required');
        }
        if (!this.VALID_REFERENCE_TYPES.includes(params.referenceType)) {
            throw new Error(`Invalid referenceType: ${params.referenceType}`);
        }
        if (!params.operationKey) {
            throw new Error('operationKey is required');
        }
        if (params.movementType === 'RECEIVE' && !params.poLineId) {
            throw new Error('poLineId is required for RECEIVE movements');
        }
        if (params.movementType === 'ADJUSTMENT' && !params.stockCountLineId && params.referenceType !== 'MANUAL_ADJUSTMENT') {
            throw new Error('stockCountLineId or MANUAL_ADJUSTMENT referenceType is required for ADJUSTMENT movements');
        }
    }

    private static async validateTenantOwnership(
        restaurantId: string,
        inventoryItemId: string,
        poLineId?: string,
        stockCountLineId?: string,
        db?: any
    ): Promise<void> {
        const inventoryItem = await db.inventory_items.findFirst({
            where: { id: inventoryItemId, restaurant_id: restaurantId }
        });

        if (!inventoryItem) {
            throw new Error('Inventory item not found or does not belong to this restaurant');
        }

        if (poLineId) {
            const poLine = await db.purchase_order_items.findFirst({
                where: {
                    id: poLineId,
                    purchase_orders: { restaurant_id: restaurantId }
                }
            });

            if (!poLine) {
                throw new Error('PO line not found or does not belong to this restaurant');
            }

            if (poLine.inventory_item_id !== inventoryItemId) {
                throw new Error('PO line inventory item does not match the provided inventory item');
            }
        }

        if (stockCountLineId) {
            const countLine = await db.stock_count_lines.findFirst({
                where: {
                    id: stockCountLineId,
                    stock_counts: { restaurant_id: restaurantId }
                }
            });

            if (!countLine) {
                throw new Error('Stock count line not found or does not belong to this restaurant');
            }

            if (countLine.inventory_item_id !== inventoryItemId) {
                throw new Error('Stock count line inventory item does not match the provided inventory item');
            }
        }
    }

    private static async validateOperationKeyUniqueness(restaurantId: string, operationKey: string, db: any): Promise<void> {
        const existing = await db.stock_movements.findFirst({
            where: { restaurant_id: restaurantId, operation_key: operationKey }
        });

        if (existing) {
            throw new Error(`operationKey '${operationKey}' already used for this restaurant`);
        }
    }

    private static formatMovement(movement: any): StockMovementResult {
        return {
            id: movement.id,
            restaurantId: movement.restaurant_id,
            inventoryItemId: movement.inventory_item_id,
            movementType: movement.movement_type,
            quantity: movement.quantity,
            unitCost: movement.unit_cost,
            referenceType: movement.reference_type,
            referenceId: movement.reference_id,
            poLineId: movement.po_line_id,
            stockCountLineId: movement.stock_count_line_id,
            operationKey: movement.operation_key,
            createdBy: movement.created_by,
            createdAt: movement.created_at,
        };
    }
}

export const stockMovementService = StockMovementService;