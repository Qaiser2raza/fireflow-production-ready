import { orders, Prisma } from '@prisma/client';
import { IOrderService, CreateOrderDTO, UpdateOrderDTO } from './IOrderService.js';
import { prisma } from '../../../shared/lib/prisma';

export abstract class BaseOrderService implements IOrderService {

    async createOrder(data: CreateOrderDTO): Promise<orders> {
        return await prisma.$transaction(async (tx) => {
            // 1. Create Base Order
            const timestamp = new Date();
            const order_number = data.order_number || `ORD-${timestamp.getHours()}${timestamp.getMinutes()}${timestamp.getSeconds()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

            const order = await tx.orders.create({
                data: {
                    restaurant_id: data.restaurant_id,
                    order_number: order_number,
                    type: data.type,
                    status: data.status || 'DRAFT',
                    total: data.total || 0,
                    table_id: data.table_id,
                    guest_count: data.guest_count,
                    customer_name: data.customer_name,
                    customer_phone: data.customer_phone,
                    delivery_address: data.delivery_address,
                    assigned_waiter_id: data.waiter_id || data.assigned_waiter_id,
                    created_at: timestamp,
                    updated_at: timestamp
                } as any
            });

            // 2. Create Order Items (Common for all)
            const itemsToCreate = data.items || data.order_items || [];
            if (itemsToCreate.length > 0) {
                await tx.order_items.createMany({
                    data: itemsToCreate.map((item: any) => ({
                        order_id: order.id,
                        menu_item_id: item.menu_item_id,
                        quantity: item.quantity,
                        unit_price: item.unit_price || item.price,
                        total_price: Number(item.total_price || (item.unit_price || item.price) * item.quantity),
                        item_name: item.item_name || item.name || item.menu_item?.name,
                        category: item.category || item.menu_item?.category,
                        station: item.station || item.menu_item?.station,
                        station_id: item.station_id || item.menu_item?.station_id,
                        item_status: item.item_status || 'DRAFT',
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
                include: { dine_in_orders: true }
            });

            // Handle Order Type Transition Cleanup
            if (currentOrder && currentOrder.type !== data.type) {
                // If it was DINE_IN and we are switching to something else
                if (currentOrder.type === 'DINE_IN' && currentOrder.table_id) {
                    await tx.tables.update({
                        where: { id: currentOrder.table_id },
                        data: {
                            status: 'AVAILABLE',
                            active_order_id: null
                        }
                    });
                    await tx.dine_in_orders.deleteMany({
                        where: { order_id: id }
                    });
                }

                // If it was TAKEAWAY, clean up takeaway record
                if (currentOrder.type === 'TAKEAWAY') {
                    await tx.takeaway_orders.deleteMany({ where: { order_id: id } });
                }

                // If it was DELIVERY, clean up delivery record
                if (currentOrder.type === 'DELIVERY') {
                    await tx.delivery_orders.deleteMany({ where: { order_id: id } });
                }
            }

            // Handle Table Release on Cancellation/Void
            if (data.status === 'CANCELLED' || data.status === 'VOIDED') {
                if (currentOrder?.table_id) {
                    await tx.tables.update({
                        where: { id: currentOrder.table_id },
                        data: {
                            status: 'AVAILABLE',
                            active_order_id: null
                        }
                    });
                }
            }

            const order = await tx.orders.update({
                where: { id },
                data: {
                    type: data.type, // Explicitly update type
                    status: data.status,
                    total: data.total,
                    table_id: data.table_id,
                    guest_count: data.guest_count,
                    customer_name: data.customer_name,
                    customer_phone: data.customer_phone,
                    delivery_address: data.delivery_address,
                    assigned_waiter_id: data.waiter_id || data.assigned_waiter_id,
                    updated_at: new Date()
                } as any
            });

            // Handle Order Items Update
            const itemsToUpdate = data.items || data.order_items;
            if (itemsToUpdate) {
                // Delete existing items and recreate (standard for draft-based POS)
                await tx.order_items.deleteMany({ where: { order_id: id } });

                if (itemsToUpdate.length > 0) {
                    await tx.order_items.createMany({
                        data: itemsToUpdate.map((item: any) => ({
                            order_id: id,
                            menu_item_id: item.menu_item_id,
                            quantity: item.quantity,
                            unit_price: item.unit_price || item.price,
                            total_price: Number(item.total_price || (item.unit_price || item.price) * item.quantity),
                            item_name: item.item_name || item.name || item.menu_item?.name,
                            category: item.category || item.menu_item?.category,
                            station: item.station || item.menu_item?.station,
                            station_id: item.station_id || item.menu_item?.station_id,
                            item_status: item.item_status || 'DRAFT',
                            modifications: item.modifications ? JSON.stringify(item.modifications) : undefined
                        }))
                    });
                }
            }

            // AUDIT LOGIC: If guest_count is being reduced, log it
            if (currentOrder?.dine_in_orders && data.guest_count < currentOrder.dine_in_orders.guest_count) {
                await tx.audit_logs.create({
                    data: {
                        action_type: 'GUEST_COUNT_REDUCTION',
                        entity_type: 'ORDER',
                        entity_id: id,
                        staff_id: data.manager_id || data.authorized_by, // Pass manager_id from the PIN validation
                        details: {
                            old_count: currentOrder.dine_in_orders.guest_count,
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
                dine_in_orders: true,
                takeaway_orders: true,
                delivery_orders: true,
                reservation_orders: true
            }
        });
        return order;
    }

    abstract validateOrder(data: CreateOrderDTO, context?: 'DRAFT' | 'FIRE'): { valid: boolean; errors: string[] };

    protected validateCommon(data: CreateOrderDTO, context?: 'DRAFT' | 'FIRE'): string[] {
        const errors: string[] = [];
        if (context === 'FIRE') {
            if (!data.items || data.items.length === 0) {
                errors.push('Cannot fire an empty order');
            }
        }
        return errors;
    }

    protected abstract createExtension(tx: Prisma.TransactionClient, orderId: string, data: CreateOrderDTO): Promise<void>;

    protected abstract updateExtension(tx: Prisma.TransactionClient, orderId: string, data: UpdateOrderDTO): Promise<void>;

    async fireOrderToKitchen(orderId: string, io: any): Promise<orders> {
        // 1. Validation before Firing
        const currentOrder = await this.getOrderDetails(orderId);
        if (!currentOrder) throw new Error('Order not found');

        const validation = this.validateOrder({
            ...currentOrder,
            type: currentOrder.type as any,
            items: (currentOrder as any).order_items
        }, 'FIRE');

        if (!validation.valid) {
            throw new Error(`Validation failed for firing: ${validation.errors.join(', ')}`);
        }

        return await prisma.$transaction(async (tx) => {
            // 2. Fetch order items with preparation requirements
            const items = await tx.order_items.findMany({
                where: { order_id: orderId },
                include: { menu_items: true }
            });

            const updatedItems = [];

            // 2. Status Splitting: FIRED for items requiring prep, READY for others
            for (const item of items) {
                const shouldFire = item.menu_items?.requires_prep ?? true;
                const newStatus = shouldFire ? 'FIRED' : 'READY';

                const updatedItem = await tx.order_items.update({
                    where: { id: item.id },
                    data: {
                        item_status: newStatus as any,
                        // Snapshot station_id if not already set (Phase 1 requirement)
                        station_id: item.station_id || item.menu_items?.station_id
                    }
                });

                if (newStatus === 'FIRED') {
                    updatedItems.push(updatedItem);
                }
            }

            // 3. Update Overall Order Status to CONFIRMED
            const order = await tx.orders.update({
                where: { id: orderId },
                data: {
                    status: 'CONFIRMED',
                    updated_at: new Date(),
                    last_action_at: new Date(),
                    last_action_desc: 'Order fired to kitchen'
                }
            });

            // 4. Socket.IO Trigger: Emit for FIRED items
            if (updatedItems.length > 0) {
                io.emit('NEW_KITCHEN_ORDER', {
                    order_id: orderId,
                    restaurant_id: order.restaurant_id,
                    items: updatedItems,
                    fired_at: new Date()
                });
            }

            // Also emit a general update for the Order Hub
            io.emit('db_change', { table: 'orders', eventType: 'UPDATE', data: order });

            return order;
        });
    }

    async deleteOrder(id: string): Promise<boolean> {
        return await prisma.$transaction(async (tx) => {
            const order = await tx.orders.findUnique({
                where: { id }
            });

            if (!order) return false;

            // 1. Rollback table status if it was DINE_IN
            if (order.type === 'DINE_IN' && order.table_id) {
                await tx.tables.update({
                    where: { id: order.table_id },
                    data: {
                        status: 'AVAILABLE',
                        active_order_id: null
                    }
                });
            }

            // 2. Delete related records (FK constraints)
            await tx.order_items.deleteMany({ where: { order_id: id } });
            await tx.dine_in_orders.deleteMany({ where: { order_id: id } });
            await tx.takeaway_orders.deleteMany({ where: { order_id: id } });
            await tx.delivery_orders.deleteMany({ where: { order_id: id } });
            await tx.reservation_orders.deleteMany({ where: { order_id: id } });
            await tx.transactions.deleteMany({ where: { order_id: id } });

            // 3. Delete the order
            await tx.orders.delete({ where: { id } });

            return true;
        });
    }
}
