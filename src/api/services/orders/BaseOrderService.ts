import { orders, Prisma } from '@prisma/client';
import { IOrderService, CreateOrderDTO, UpdateOrderDTO } from './IOrderService.js';
import { prisma } from '../../../shared/lib/prisma';

export abstract class BaseOrderService implements IOrderService {

    async createOrder(data: CreateOrderDTO): Promise<orders> {
        return await prisma.$transaction(async (tx) => {
            // 1. Create Base Order
            const order = await tx.orders.create({
                data: {
                    restaurant_id: data.restaurant_id,
                    type: data.type,
                    status: data.status || 'DRAFT',
                    total: data.total || 0,
                    // Map other common fields if present in DTO
                    created_at: new Date(),
                    updated_at: new Date()
                }
            });

            // 2. Create Order Items (Common for all)
            if (data.items && data.items.length > 0) {
                await tx.order_items.createMany({
                    data: data.items.map((item) => ({
                        order_id: order.id,
                        menu_item_id: item.menu_item_id,
                        quantity: item.quantity,
                        unit_price: item.price,
                        total_price: Number(item.price) * Number(item.quantity),
                        item_name: item.name,
                        category: item.category,
                        station: item.station,
                        modifications: item.modifications ? JSON.stringify(item.modifications) : undefined
                    }))
                });
            }

            // 3. Delegate to specific implementation
            await this.createExtension(tx, order.id, data);

            return order;
        });
    }

    // Inside BaseOrderService.ts
    async updateOrder(id: string, data: UpdateOrderDTO): Promise<orders> {
        return await prisma.$transaction(async (tx) => {
            // Fetch current state to compare for "Incremental Errors"
            const currentOrder = await tx.orders.findUnique({
                where: { id },
                include: { dine_in_order: true }
            });

            const order = await tx.orders.update({
                where: { id },
                data: {
                    status: data.status,
                    total: data.total,
                    updated_at: new Date()
                }
            });

            // AUDIT LOGIC: If guest_count is being reduced, log it
            if (currentOrder?.dine_in_order && data.guest_count < currentOrder.dine_in_order.guest_count) {
                await tx.audit_logs.create({
                    data: {
                        action_type: 'GUEST_COUNT_REDUCTION',
                        entity_type: 'ORDER',
                        entity_id: id,
                        staff_id: data.manager_id, // Pass manager_id from the PIN validation
                        details: {
                            old_count: currentOrder.dine_in_order.guest_count,
                            new_count: data.guest_count
                        }
                    }
                });
            }

            await this.updateExtension(tx, id, data);
            return order;
        });
    }

    async getOrderDetails(id: string): Promise<orders | null> {
        const order = await prisma.orders.findUnique({
            where: { id },
            include: {
                order_items: true,
                dine_in_order: true,
                takeaway_order: true,
                delivery_order: true,
                reservation_order: true
            }
        });
        return order;
    }

    abstract validateOrder(data: CreateOrderDTO): { valid: boolean; errors: string[] };

    protected abstract createExtension(tx: Prisma.TransactionClient, orderId: string, data: CreateOrderDTO): Promise<void>;

    protected abstract updateExtension(tx: Prisma.TransactionClient, orderId: string, data: UpdateOrderDTO): Promise<void>;
}
