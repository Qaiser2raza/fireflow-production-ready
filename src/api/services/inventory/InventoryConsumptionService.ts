import { prisma } from '../../../shared/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { StockMovementService, StockMovementResult } from './StockMovementService';
import { wacProjectionService } from './WACProjectionService';
import { journalEntryService } from '../JournalEntryService';

export interface ConsumeOrderParams {
    orderId: string;
    restaurantId: string;
    operationKeyPrefix?: string;
    tx?: any;
}

export interface ConsumeOrderResult {
    movements: StockMovementResult[];
    totalCogs: Decimal;
    consumedItems: Array<{
        inventoryItemId: string;
        inventoryItemName: string;
        quantityConsumed: Decimal;
        unitCost: Decimal;
        totalCost: Decimal;
    }>;
}

export class InventoryConsumptionService {
    private static readonly CONSUME_PREFIX = 'CONSUME';

    static async consumeOrderOnServed(params: ConsumeOrderParams): Promise<ConsumeOrderResult> {
        const db = params.tx || prisma;
        const prefix = params.operationKeyPrefix || this.CONSUME_PREFIX;

        const order = await db.orders.findFirst({
            where: { id: params.orderId, restaurant_id: params.restaurantId },
            include: { order_items: { include: { menu_items: true } } }
        });

        if (!order) {
            throw new Error('Order not found or does not belong to this restaurant');
        }

        const movements: StockMovementResult[] = [];
        const consumedItems: ConsumeOrderResult['consumedItems'] = [];
        let totalCogs = new Decimal(0);

        for (const orderItem of order.order_items) {
            const recipeItems = await db.recipe_items.findMany({
                where: { menu_item_id: orderItem.menu_item_id },
                include: { inventory_items: true }
            });

            for (const recipeItem of recipeItems) {
                const quantityRequired = new Decimal(recipeItem.quantity_required.toString());
                const quantityToConsume = quantityRequired.times(orderItem.quantity);

                const operationKey = `${prefix}:${params.orderId}:${recipeItem.inventory_item_id}`;

                const existingMovement = await db.stock_movements.findFirst({
                    where: { operation_key: operationKey, restaurant_id: params.restaurantId }
                });

                if (existingMovement) {
                    const movement = StockMovementService['formatMovement'](existingMovement);
                    movements.push(movement);
                    const totalCost = new Decimal(movement.totalCost.toString()).abs();
                    totalCogs = totalCogs.plus(totalCost);
                    consumedItems.push({
                        inventoryItemId: recipeItem.inventory_item_id,
                        inventoryItemName: recipeItem.inventory_items?.name || 'Unknown',
                        quantityConsumed: new Decimal(movement.quantity.toString()).abs(),
                        unitCost: new Decimal(movement.unitCost.toString()),
                        totalCost
                    });
                    continue;
                }

                const currentWAC = await db.inventory_items.findFirst({
                    where: { id: recipeItem.inventory_item_id, restaurant_id: params.restaurantId },
                    select: { average_unit_cost: true, unit_cost: true }
                });
                const wacCost = (currentWAC?.average_unit_cost && !new Decimal(currentWAC.average_unit_cost.toString()).isZero())
                    ? new Decimal(currentWAC.average_unit_cost.toString())
                    : (currentWAC?.unit_cost || 0);

                let movement;
                let isNew = true;
                try {
                    movement = await StockMovementService.createMovement({
                        restaurantId: params.restaurantId,
                        inventoryItemId: recipeItem.inventory_item_id,
                        movementType: 'CONSUME',
                        quantity: quantityToConsume.negated(),
                        unitCost: wacCost,
                        referenceType: 'RECIPE_USAGE',
                        referenceId: params.orderId,
                        operationKey,
                        createdBy: 'system'
                    }, db);
                } catch (err: any) {
                    if (err?.code === 'P2002') {
                        isNew = false;
                        const existing = await db.stock_movements.findFirst({
                            where: { operation_key: operationKey, restaurant_id: params.restaurantId }
                        });
                        if (existing) {
                            movement = StockMovementService['formatMovement'](existing);
                        }
                    } else {
                        throw err;
                    }
                }

                if (!movement) {
                    throw new Error(`Failed to create movement for ${recipeItem.inventory_item_id}`);
                }

                if (isNew) {
                    await wacProjectionService.updateAverageCost(
                        recipeItem.inventory_item_id,
                        params.restaurantId,
                        quantityToConsume.negated(),
                        new Decimal(wacCost.toString()),
                        db
                    );
                }

                movements.push(movement);
                const movementTotalCost = new Decimal(movement.totalCost.toString()).abs();
                totalCogs = totalCogs.plus(movementTotalCost);
                consumedItems.push({
                    inventoryItemId: recipeItem.inventory_item_id,
                    inventoryItemName: recipeItem.inventory_items?.name || 'Unknown',
                    quantityConsumed: quantityToConsume,
                    unitCost: new Decimal(wacCost.toString()),
                    totalCost: movementTotalCost
                });
            }
        }

        // POST COGS JOURNAL (idempotent — safe to call multiple times)
        try {
            await journalEntryService.recordOrderCOGSJournal({
                restaurantId: params.restaurantId,
                orderId: params.orderId,
                totalCogs,
                consumedItems: consumedItems.map(item => ({
                    inventoryItemId: item.inventoryItemId,
                    inventoryItemName: item.inventoryItemName,
                    quantityConsumed: item.quantityConsumed,
                    unitCost: item.unitCost,
                    totalCost: item.totalCost
                })),
                processedBy: 'system'
            }, db);
        } catch (e) {
            // COGS journal failure does NOT abort the consumption;
            // the service records movements and COGS cost, journal posting is a best-effort audit trail
            console.warn(`[Consumption] COGS journal post failed: ${e instanceof Error ? e.message : e}`);
        }

        return { movements, totalCogs, consumedItems };
    }

    static async getConsumptionPreview(orderId: string, restaurantId: string, tx?: any): Promise<ConsumeOrderResult> {
        const db = tx || prisma;

        const order = await db.orders.findFirst({
            where: { id: orderId, restaurant_id: restaurantId },
            include: { order_items: { include: { menu_items: true } } }
        });

        if (!order) {
            throw new Error('Order not found or does not belong to this restaurant');
        }

        const consumedItems: ConsumeOrderResult['consumedItems'] = [];
        let totalCogs = new Decimal(0);

        for (const orderItem of order.order_items) {
            const recipeItems = await db.recipe_items.findMany({
                where: { menu_item_id: orderItem.menu_item_id },
                include: { inventory_items: true }
            });

            for (const recipeItem of recipeItems) {
                const quantityRequired = new Decimal(recipeItem.quantity_required.toString());
                const quantityToConsume = quantityRequired.times(orderItem.quantity);

                const currentWAC = await (tx || prisma).inventory_items.findFirst({
                    where: { id: recipeItem.inventory_item_id, restaurant_id: restaurantId },
                    select: { average_unit_cost: true, unit_cost: true }
                });
                const wacCost = (currentWAC?.average_unit_cost && !new Decimal(currentWAC.average_unit_cost.toString()).isZero())
                    ? new Decimal(currentWAC.average_unit_cost.toString())
                    : (currentWAC?.unit_cost || 0);

                const unitCostDecimal = new Decimal(wacCost.toString());
                const totalCost = unitCostDecimal.times(quantityToConsume);
                totalCogs = totalCogs.plus(totalCost);

                consumedItems.push({
                    inventoryItemId: recipeItem.inventory_item_id,
                    inventoryItemName: recipeItem.inventory_items?.name || 'Unknown',
                    quantityConsumed: quantityToConsume,
                    unitCost: unitCostDecimal,
                    totalCost
                });
            }
        }

        return { movements: [], totalCogs, consumedItems };
    }
}

export const inventoryConsumptionService = InventoryConsumptionService;