import { prisma } from '../../../shared/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

export interface WACProjection {
  averageUnitCost: Decimal;
  totalCostBasis: Decimal;
  currentQuantity: Decimal;
}

export interface RecalcWACResult {
  averageUnitCost: Decimal;
  totalCostBasis: Decimal;
  currentQuantity: Decimal;
}

export class WACProjectionService {
  static async getCurrentQuantity(
    inventoryItemId: string,
    restaurantId: string,
    tx?: any
  ): Promise<Decimal> {
    const db = tx || prisma;

    const total = await db.stock_movements.aggregate({
      where: {
        restaurant_id: restaurantId,
        inventory_item_id: inventoryItemId,
      },
      _sum: {
        quantity: true,
      },
    });

    return new Decimal(total._sum.quantity ?? 0);
  }

  static async recalcWAC(
    inventoryItemId: string,
    restaurantId: string,
    tx?: any
  ): Promise<RecalcWACResult> {
    const db = tx || prisma;

    // 1. Get all movements in chronological order
    const movements = await db.stock_movements.findMany({
      where: {
        restaurant_id: restaurantId,
        inventory_item_id: inventoryItemId,
      },
      orderBy: { created_at: 'asc' },
    });

    // 2. Compute running totals from movements
    let totalQuantity = new Decimal(0);
    let totalCost = new Decimal(0);

    for (const m of movements) {
      const qty = new Decimal(m.quantity.toString());
      const unitCost = new Decimal((m.unit_cost || 0).toString());
      totalQuantity = totalQuantity.plus(qty);
      totalCost = totalCost.plus(qty.times(unitCost));
    }

    // 3. Compute average unit cost
    const averageUnitCost = totalQuantity.isZero()
      ? new Decimal(0)
      : totalCost.dividedBy(totalQuantity);

    return {
      averageUnitCost,
      totalCostBasis: totalCost,
      currentQuantity: totalQuantity,
    };
  }

static async updateAverageCost(
    inventoryItemId: string,
    restaurantId: string,
    qtyDelta: Decimal,
    unitCostOfDelta: Decimal,
    tx?: any
  ): Promise<WACProjection> {
    const db = tx || prisma;

    const existing = await db.inventory_items.findFirst({
      where: { id: inventoryItemId, restaurant_id: restaurantId },
      select: { average_unit_cost: true, total_cost_basis: true, current_stock: true }
    });

    const existingBasis = existing ? new Decimal(existing.total_cost_basis.toString()) : new Decimal(0);
    const existingQty = existing ? new Decimal(existing.current_stock.toString()) : new Decimal(0);

    const newQuantity = existingQty.plus(qtyDelta);
    const newBasis = existingBasis.plus(qtyDelta.times(unitCostOfDelta));

    const newAverage = newQuantity.abs().isZero()
      ? new Decimal(0)
      : newBasis.dividedBy(newQuantity);

    await db.inventory_items.update({
      where: { id: inventoryItemId, restaurant_id: restaurantId },
      data: {
        average_unit_cost: newAverage,
        total_cost_basis: newBasis,
        current_stock: newQuantity,
      },
    });

    return {
      averageUnitCost: newAverage,
      totalCostBasis: newBasis,
      currentQuantity: newQuantity,
    };
  }
}

export const wacProjectionService = WACProjectionService;