import { prisma } from '../../../shared/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { StockMovementService, StockMovementResult } from './StockMovementService';
import { wacProjectionService } from './WACProjectionService';

export interface ReceivePOLineParams {
    restaurantId: string;
    poLineId: string;
    quantity: Decimal | number | string;
    operationKey: string;
    createdBy?: string;
}

export interface ReceivePOLineResult {
    movement: StockMovementResult;
    poLine: {
        id: string;
        quantityReceived: Decimal;
        quantityRemaining: Decimal;
    };
    isFullReceipt: boolean;
}

export class PurchaseOrderReceiveService {
    static async receivePOLine(params: ReceivePOLineParams, tx?: any): Promise<ReceivePOLineResult> {
        const db = tx || prisma;

        if (!params.restaurantId) {
            throw new Error('restaurantId is required');
        }
        if (!params.poLineId) {
            throw new Error('poLineId is required');
        }
        if (params.quantity === undefined || params.quantity === null) {
            throw new Error('quantity is required');
        }
        if (!params.operationKey) {
            throw new Error('operationKey is required for idempotency');
        }

        const quantity = new Decimal(params.quantity.toString());

        if (quantity.lte(0)) {
            throw new Error('Receive quantity must be positive');
        }

        return await db.$transaction(async (txInner: any) => {
            const poLine = await txInner.purchase_order_items.findFirst({
                where: {
                    id: params.poLineId,
                    purchase_orders: { restaurant_id: params.restaurantId }
                },
                include: {
                    purchase_orders: true
                }
            });

            if (!poLine) {
                throw new Error('PO line not found or does not belong to this restaurant');
            }

            const existingMovements = await txInner.stock_movements.findMany({
                where: {
                    po_line_id: params.poLineId,
                    restaurant_id: params.restaurantId,
                    movement_type: 'RECEIVE'
                }
            });

            const existingMovement = existingMovements.find((m: any) => m.operation_key === params.operationKey);
            if (existingMovement) {
                const currentReceived = new Decimal(poLine.quantity_received);
                const totalOrdered = new Decimal(poLine.quantity_ordered);
                return {
                    movement: StockMovementService['formatMovement'](existingMovement),
                    poLine: {
                        id: poLine.id,
                        quantityReceived: currentReceived,
                        quantityRemaining: totalOrdered.minus(currentReceived)
                    },
                    isFullReceipt: currentReceived.gte(totalOrdered)
                };
            }

            const totalReceivedSoFar = existingMovements.reduce(
                (sum: Decimal, m: any) => sum.plus(new Decimal(m.quantity)),
                new Decimal(0)
            );

            const quantityOrdered = new Decimal(poLine.quantity_ordered);
            const newTotalReceived = totalReceivedSoFar.plus(quantity);
            const remainingAfter = quantityOrdered.minus(newTotalReceived);

            if (remainingAfter.lt(0)) {
                throw new Error(
                    `Cannot receive ${quantity.toString()} units. Only ${quantityOrdered.minus(totalReceivedSoFar).toString()} remaining on this PO line.`
                );
            }

            const movement = await StockMovementService.createMovement({
                restaurantId: params.restaurantId,
                inventoryItemId: poLine.inventory_item_id,
                movementType: 'RECEIVE',
                quantity: quantity,
                unitCost: poLine.unit_price,
                referenceType: 'PURCHASE_ORDER',
                referenceId: poLine.purchase_order_id,
                poLineId: params.poLineId,
                operationKey: params.operationKey,
                createdBy: params.createdBy
            }, txInner);

            await wacProjectionService.updateAverageCost(
                poLine.inventory_item_id,
                params.restaurantId,
                quantity,
                new Decimal(poLine.unit_price.toString()),
                txInner
            );

            const updatedPOLine = await txInner.purchase_order_items.update({
                where: { id: params.poLineId },
                data: {
                    quantity_received: {
                        increment: quantity
                    }
                }
            });

            const isFullReceipt = new Decimal(updatedPOLine.quantity_received).gte(quantityOrdered);

            return {
                movement,
                poLine: {
                    id: updatedPOLine.id,
                    quantityReceived: updatedPOLine.quantity_received,
                    quantityRemaining: quantityOrdered.minus(updatedPOLine.quantity_received)
                },
                isFullReceipt
            };
        });
    }
}

export const purchaseOrderReceiveService = PurchaseOrderReceiveService;