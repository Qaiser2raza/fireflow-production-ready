import { orders, Prisma, TaxType } from '@prisma/client';
import { IOrderService, CreateOrderDTO, UpdateOrderDTO } from './IOrderService.js';
import { prisma } from '../../../shared/lib/prisma';

export abstract class BaseOrderService implements IOrderService {
    
    protected async resolveCustomerId(tx: Prisma.TransactionClient, restaurantId: string, phone?: string, name?: string, providedId?: string): Promise<string | null> {
        if (providedId) return providedId;
        if (!phone) return null;

        // Try to find existing customer by phone within this restaurant
        const existing = await tx.customers.findFirst({
            where: {
                restaurant_id: restaurantId,
                phone: phone
            }
        });

        if (existing) return existing.id;

        // If not found but we have a name, create a new customer record automatically
        if (name) {
            const newCustomer = await tx.customers.create({
                data: {
                    restaurant_id: restaurantId,
                    name: name,
                    phone: phone
                }
            });
            return newCustomer.id;
        }

        return null;
    }

    async createOrder(data: CreateOrderDTO): Promise<orders> {
        return await prisma.$transaction(async (tx) => {
            // 1. Create Base Order
            const timestamp = new Date();
            const order_number = data.order_number || `ORD-${timestamp.getHours()}${timestamp.getMinutes()}${timestamp.getSeconds()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

            const customerId = await this.resolveCustomerId(tx, data.restaurant_id, data.customer_phone, data.customer_name, data.customer_id);
            const order = await tx.orders.create({
                data: {
                    restaurants: {
                        connect: { id: data.restaurant_id }
                    },
                    order_number: order_number,
                    type: data.type,
                    status: this.mapStatusToPrisma(data.status),
                    payment_status: 'UNPAID',
                    total: data.total || 0,
                    guest_count: data.guest_count ? Number(data.guest_count) : undefined,
                    customer_name: data.customer_name,
                    customer_phone: data.customer_phone,
                    customers: customerId 
                        ? { connect: { id: customerId } } 
                        : undefined,
                    delivery_address: data.delivery_address,
                    // Standard Prisma connections for relations
                    tables: data.table_id ? { connect: { id: data.table_id } } : undefined,
                    staff_orders_assigned_waiter_idTostaff: (data.waiter_id || data.assigned_waiter_id) ? { connect: { id: data.waiter_id || data.assigned_waiter_id } } : undefined,
                    created_at: timestamp,
                    updated_at: timestamp
                }
            });

            // 2. Create Order Items (Common for all)
            const itemsToCreate = data.items || data.order_items || [];
            if (itemsToCreate.length > 0) {
                // Pre-resolve menu item metadata to ensure KDS routing works even if POS payload is partial
                const menuItemIds = [...new Set(itemsToCreate.map((i: any) => i.menu_item_id))];
                const menuItemsMetadata = await tx.menu_items.findMany({
                    where: { id: { in: menuItemIds as string[] } }
                });

                await tx.order_items.createMany({
                    data: itemsToCreate.map((item: any) => {
                        const meta = menuItemsMetadata.find(m => m.id === item.menu_item_id);
                        return {
                            order_id: order.id,
                            menu_item_id: item.menu_item_id,
                            quantity: item.quantity,
                            unit_price: item.unit_price || item.price,
                            total_price: Number(item.total_price || (item.unit_price || item.price) * item.quantity),
                            item_name: item.item_name || item.name || meta?.name || 'Unknown Item',
                            category: item.category || meta?.category || 'General',
                            station: item.station || meta?.station || 'KITCHEN',
                            station_id: item.station_id || meta?.station_id || undefined,
                            item_status: item.item_status || 'DRAFT',
                            variant_id: item.variant_id || undefined,
                            modifications: item.modifications ? JSON.stringify(item.modifications) : undefined
                        };
                    })
                });
            }

            // 3. Delegate to specific implementation
            await this.createExtension(tx, order.id, data);

            // 4. Save explicit breakdown from POS if provided, or auto-calculate
            const breakdown = data.breakdown as any;
            await this.recalculateTotals(tx, order.id, breakdown ? {
                tax: breakdown.tax,
                serviceCharge: breakdown.serviceCharge,
                deliveryFee: breakdown.deliveryFee,
                discount: breakdown.discount,
                tax_enabled: breakdown.tax_enabled,
                service_charge_enabled: breakdown.service_charge_enabled,
                delivery_fee_enabled: breakdown.delivery_fee_enabled,
                tax_type: breakdown.tax_type,
                tax_exempt: breakdown.tax_exempt,
                discount_type: breakdown.discount_type,
                discount_value: breakdown.discount_value,
                discountReason: breakdown.discountReason
            } : undefined);

            // 5. Return full order with items for frontend sync
            return await tx.orders.findUnique({
                where: { id: order.id },
                include: {
                    order_items: {
                        include: {
                            menu_item_variants: true
                        }
                    },
                    dine_in_orders: true,
                    takeaway_orders: true,
                    delivery_orders: true,
                    reservation_orders: true
                }
            }) as orders;
        }, { timeout: 20000, maxWait: 20000 });
    }

    // Inside BaseOrderService.ts
    async updateOrder(id: string, data: UpdateOrderDTO): Promise<orders> {
        return await prisma.$transaction(async (tx) => {
            // 1. Fetch current state
            const currentOrder = await tx.orders.findUnique({
                where: { id },
                include: { dine_in_orders: true }
            });

            if (!currentOrder) throw new Error('Order not found');

            // 2. Handle Order Type Transition Cleanup
            if (currentOrder.type !== data.type) {
                if (currentOrder.type === 'DINE_IN' && currentOrder.table_id) {
                    await tx.tables.update({
                        where: { id: currentOrder.table_id },
                        data: { status: 'AVAILABLE', active_order_id: null }
                    });
                    await tx.dine_in_orders.deleteMany({ where: { order_id: id } });
                }
                if (currentOrder.type === 'TAKEAWAY') await tx.takeaway_orders.deleteMany({ where: { order_id: id } });
                if (currentOrder.type === 'DELIVERY') await tx.delivery_orders.deleteMany({ where: { order_id: id } });
            }

            // 3. Handle Status Transitions (Cancellation table release)
            if (data.status === 'CANCELLED' || data.status === 'VOIDED') {
                if (currentOrder.table_id) {
                    await tx.tables.update({
                        where: { id: currentOrder.table_id },
                        data: { status: 'AVAILABLE', active_order_id: null }
                    });
                }
            }

            // 4. Handle Table Status when switching TO DINE_IN
            if (data.type === 'DINE_IN' && data.table_id) {
                await tx.tables.update({
                    where: { id: data.table_id },
                    data: { status: 'OCCUPIED', active_order_id: id }
                });
                
                const existingDineIn = await tx.dine_in_orders.findUnique({ where: { order_id: id } });
                if (!existingDineIn) {
                    await tx.dine_in_orders.create({
                        data: { order_id: id, table_id: data.table_id, guest_count: data.guest_count || 1 }
                    });
                }
            }

            const customerId = await this.resolveCustomerId(tx, currentOrder.restaurant_id, data.customer_phone, data.customer_name, data.customer_id);
            
            const orderUpdatePayload: any = {
                type: data.type,
                status: this.mapStatusToPrisma(data.status),
                total: data.total,
                guest_count: data.guest_count,
                customer_name: data.customer_name,
                customer_phone: data.customer_phone,
                delivery_address: data.delivery_address,
                updated_at: new Date()
            };

            if (data.table_id) orderUpdatePayload.tables = { connect: { id: data.table_id } };
            if (customerId) orderUpdatePayload.customers = { connect: { id: customerId } };
            
            const waiterId = data.waiter_id || data.assigned_waiter_id;
            if (waiterId) orderUpdatePayload.staff_orders_assigned_waiter_idTostaff = { connect: { id: waiterId } };
            
            const driverId = data.driver_id || data.assigned_driver_id;
            if (driverId) orderUpdatePayload.staff_orders_assigned_driver_idTostaff = { connect: { id: driverId } };

            await tx.orders.update({
                where: { id },
                data: orderUpdatePayload
            });

            // 5. Automatic Item status promotion on 'SERVED'
            if (data.status === 'SERVED') {
                await tx.order_items.updateMany({
                    where: { order_id: id, item_status: { in: ['DONE', 'PENDING', 'PREPARING'] } },
                    data: { item_status: 'SERVED' }
                });
            }

            // 6. Handle Order Items Update (Robut Backend-Driven Sync v4.6)
            const itemsToUpdate = data.items || data.order_items;
            if (itemsToUpdate) {
                const statusWeight: { [key: string]: number } = {
                    'DRAFT': 0, 'PENDING': 1, 'PREPARING': 2, 'DONE': 3,
                    'SERVED': 4, 'CANCELLED': 5, 'VOIDED': 6
                };

                const existingItems = await tx.order_items.findMany({ where: { order_id: id } });
                const claimedIds = new Set<string>();

                // Pre-fetch menu metadata for NEW items to ensure KDS info is populated
                const newMenuItemsIds = [...new Set(itemsToUpdate.filter((i: any) => !i.id || !existingItems.find(ei => ei.id === i.id)).map((i: any) => i.menu_item_id))];
                const menuItemsMetadata = newMenuItemsIds.length > 0 ? await tx.menu_items.findMany({
                    where: { id: { in: newMenuItemsIds as string[] } }
                }) : [];

                for (const item of itemsToUpdate) {
                    // Smart Matching: First try exact ID match
                    let existing = item.id ? existingItems.find(ei => ei.id === item.id) : null;
                    
                    // Fallback: ONLY for items with NO id (legacy clients).
                    if (!existing && !item.id) {
                        existing = existingItems.find(ei => 
                            ei.menu_item_id === item.menu_item_id && 
                            !claimedIds.has(ei.id) &&
                            (statusWeight[ei.item_status!] < 4) // Only adopt non-terminal states
                        );
                    }

                    const incomingWeight = statusWeight[item.item_status] ?? 1;
                    const dbWeight = existing ? (statusWeight[existing.item_status as string] ?? 0) : 0;
                    
                    // Status Guard: Backend status > Frontend status -> Persist Backend
                    const finalStatus = dbWeight > incomingWeight 
                        ? existing!.item_status as string
                        : (item.item_status || 'PENDING');

                    if (existing) {
                        claimedIds.add(existing.id);
                        await tx.order_items.update({
                            where: { id: existing.id },
                            data: { 
                                quantity: item.quantity,
                                total_price: Number((item.unit_price || item.price) * item.quantity),
                                item_status: finalStatus as any,
                                modifications: item.modifications 
                                    ? (typeof item.modifications === 'string' ? item.modifications : JSON.stringify(item.modifications)) : undefined,
                                variant_id: item.variant_id || undefined
                            }
                        });
                    } else {
                        const meta = menuItemsMetadata.find(m => m.id === item.menu_item_id);
                        const newItem = await tx.order_items.create({
                            data: {
                                id: item.id || undefined, 
                                order_id: id,
                                menu_item_id: item.menu_item_id,
                                quantity: item.quantity,
                                unit_price: item.unit_price || item.price,
                                total_price: Number(item.total_price || (item.unit_price || item.price) * item.quantity),
                                item_name: item.item_name || item.name || meta?.name || 'Unknown Item',
                                category: item.category || meta?.category || 'General',
                                station: item.station || meta?.station || 'KITCHEN',
                                station_id: item.station_id || meta?.station_id || undefined,
                                item_status: (item.item_status || 'PENDING') as any,
                                variant_id: item.variant_id || undefined,
                                modifications: item.modifications ? (typeof item.modifications === 'string' ? item.modifications : JSON.stringify(item.modifications)) : undefined
                            }
                        });
                        claimedIds.add(newItem.id);
                    }
                }

                // Never delete fired items (PENDING+) even if the frontend forgot them
                for (const existing of existingItems) {
                    if (!claimedIds.has(existing.id)) {
                        if (statusWeight[existing.item_status as string] === 0) { // Only delete DRAFT
                            await tx.order_items.delete({ where: { id: existing.id } });
                        }
                    }
                }
            }

            // 7. Audit Logic
            const dineInRecord = Array.isArray(currentOrder.dine_in_orders) ? currentOrder.dine_in_orders[0] : currentOrder.dine_in_orders;
            if (dineInRecord && data.guest_count != null && data.guest_count < (dineInRecord as any).guest_count) {
                await tx.audit_logs.create({
                    data: {
                        action_type: 'GUEST_COUNT_REDUCTION',
                        entity_type: 'ORDER',
                        entity_id: id,
                        staff_id: data.manager_id || data.authorized_by,
                        details: { old_count: (dineInRecord as any).guest_count, new_count: data.guest_count }
                    }
                });
            }

            await this.updateExtension(tx, id, data);

            // 8. Recalculate Totals
            const breakdown = (data as any).breakdown;
            await this.recalculateTotals(tx, id, breakdown ? {
                tax: breakdown.tax, serviceCharge: breakdown.serviceCharge, deliveryFee: breakdown.deliveryFee,
                discount: breakdown.discount, tax_enabled: breakdown.tax_enabled, service_charge_enabled: breakdown.service_charge_enabled,
                delivery_fee_enabled: breakdown.delivery_fee_enabled, tax_type: breakdown.tax_type, tax_exempt: breakdown.tax_exempt,
                discount_type: breakdown.discount_type, discount_value: breakdown.discount_value, discountReason: breakdown.discountReason
            } : undefined);

            // 9. Return full order
            const finalOrder = await tx.orders.findUnique({
                where: { id },
                include: {
                    order_items: { include: { menu_item_variants: true } },
                    dine_in_orders: true, takeaway_orders: true, delivery_orders: true, reservation_orders: true
                }
            });
            if (!finalOrder) throw new Error('Order lost after update');
            return finalOrder as orders;
        }, { timeout: 20000, maxWait: 20000 });
    }

    protected mapStatusToPrisma(status: string | undefined): any {
        if (!status) return 'ACTIVE';
        const map: Record<string, string> = {
            'PENDING': 'ACTIVE',
            'PREPARING': 'ACTIVE',
            // 'SERVED' should stay as 'SERVED' (it's in the Prisma enum)
            'BILL_REQUESTED': 'BILL_REQUESTED',
            'PAID': 'CLOSED',
            'VOID': 'VOIDED'
        };
        return (map[status] || status) as any;
    }

    async getOrderDetails(id: string): Promise<orders | null> {
        const order = await prisma.orders.findUnique({
            where: { id },
            include: {
                order_items: {
                    include: {
                        menu_item_variants: true
                    }
                },
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

    /**
     * Centralized logic to calculate order financials (Tax, SC, Delivery Fee).
     * Priority: if the order has a pre-calculated breakdown from the POS (respecting
     * user's on-screen toggles), use it directly. Otherwise fall back to restaurant config.
     */
    protected async recalculateTotals(
        tx: Prisma.TransactionClient,
        orderId: string,
        overrideBreakdown?: { 
          tax?: number; 
          serviceCharge?: number; 
          deliveryFee?: number; 
          discount?: number; 
          total?: number;
          tax_enabled?: boolean;
          service_charge_enabled?: boolean;
          delivery_fee_enabled?: boolean;
          tax_type?: TaxType;
          tax_exempt?: boolean;
          discount_type?: string;
          discount_value?: number;
          discountReason?: string;
        }
    ): Promise<void> {
        // 1. Fetch Order and its Items
        const order = await tx.orders.findUnique({
            where: { id: orderId },
            include: { restaurants: true }
        });

        if (!order || !order.restaurants) return;

        const orderItems = await tx.order_items.findMany({
            where: { order_id: orderId }
        });

        // 2. Fetch order_type_defaults for mandatory charge config
        const config = await tx.order_type_defaults.findUnique({
            where: {
                restaurant_id_order_type: {
                    restaurant_id: order.restaurant_id,
                    order_type: order.type
                }
            }
        });

        if (!config) {
            throw new Error(`Critical Error: No order type defaults found for restaurant ${order.restaurant_id} and type ${order.type}`);
        }

        // Step 1 - Subtotal from items
        const subtotal = orderItems.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
        
        // Step 2 - Apply discount → taxable_amount
        const discountAmount = Number(overrideBreakdown?.discount ?? order.discount ?? 0);
        const taxable_amount = Math.max(0, subtotal - discountAmount);

        // Step 3 - Tax
        // Override Priority: order.tax_exempt (manual override) > config defaults
        const isTaxExempt = overrideBreakdown?.tax_exempt ?? order.tax_exempt ?? false;
        const currentTaxType = overrideBreakdown?.tax_type ?? order.tax_type ?? (config.tax_type as TaxType);
        const taxRate = Number(config.tax_rate);
        const taxEnabled = config.tax_enabled;

        let tax_amount = 0;
        if (isTaxExempt || !taxEnabled) {
            tax_amount = 0;
        } else {
            if (currentTaxType === 'INCLUSIVE') {
                // taxAmount = taxableAmount × rate / (100 + rate)
                tax_amount = (taxable_amount * taxRate) / (100 + taxRate);
            } else {
                // taxAmount = taxableAmount × rate / 100
                tax_amount = (taxable_amount * taxRate) / 100;
            }
        }

        // Step 4 - SVC on NET amount (after extracting embedded tax for INCLUSIVE)
        // This matches billEngine.ts: SVC is always on the pre-tax base.
        const svcEnabled = overrideBreakdown?.service_charge_enabled ?? config.svc_enabled;
        const svcRate = Number(config.svc_rate);
        let svc_amount = 0;
        if (svcEnabled) {
            const svcBase = currentTaxType === 'INCLUSIVE'
                ? (taxable_amount - tax_amount)   // Net amount (tax extracted)
                : taxable_amount;                  // Already net for EXCLUSIVE
            svc_amount = (svcBase * svcRate) / 100;
        }

        // Step 5 - Delivery fee added flat at end (not taxable)
        let delivery_fee = 0;
        if (order.type === 'DELIVERY') {
            const deliveryFeeEnabled = overrideBreakdown?.delivery_fee_enabled ?? true;
            delivery_fee = deliveryFeeEnabled ? Number(overrideBreakdown?.deliveryFee ?? config.delivery_fee) : 0;
        }

        // Step 6 - Total
        // If INCLUSIVE: taxable_amount already includes tax_amount.
        // If EXCLUSIVE: taxable_amount needs tax_amount added.
        let total = 0;
        if (currentTaxType === 'INCLUSIVE') {
            total = taxable_amount + svc_amount + delivery_fee;
        } else {
            total = taxable_amount + tax_amount + svc_amount + delivery_fee;
        }

        // Rounding: line items precise to 2 decimal places, grand total to nearest 10
        const raw_total = Math.round(total * 100) / 100;
        const rounded = {
            subtotal: Math.round(subtotal * 100) / 100,
            discount_amount: Math.round(discountAmount * 100) / 100,
            taxable_amount: Math.round(taxable_amount * 100) / 100,
            tax_amount: Math.round(tax_amount * 100) / 100,
            svc_amount: Math.round(svc_amount * 100) / 100,
            delivery_fee: Math.round(delivery_fee * 100) / 100,
            total: Math.round(raw_total / 10) * 10  // Round to nearest 10
        };

        // Fetch existing breakdown to preserve UI-only fields
        const existingBreakdown = (order.breakdown as any) || {};

        const breakdown = {
            // Preserve UI-only fields from previous save
            discount_type: overrideBreakdown?.discount_type ?? existingBreakdown.discount_type ?? 'flat',
            discount_value: overrideBreakdown?.discount_value ?? existingBreakdown.discount_value ?? rounded.discount_amount,
            discountReason: overrideBreakdown?.discountReason ?? existingBreakdown.discountReason ?? '',
            tax_enabled: overrideBreakdown?.tax_enabled ?? existingBreakdown.tax_enabled ?? config.tax_enabled ?? true,
            service_charge_enabled: overrideBreakdown?.service_charge_enabled ?? existingBreakdown.service_charge_enabled ?? config.svc_enabled ?? false,
            delivery_fee_enabled: overrideBreakdown?.delivery_fee_enabled ?? existingBreakdown.delivery_fee_enabled ?? (order.type === 'DELIVERY'),
            // Financial fields (always recalculated)
            subtotal: rounded.subtotal,
            discount_amount: rounded.discount_amount,
            taxable_amount: rounded.taxable_amount,
            tax_rate: taxRate,
            tax_type: currentTaxType,
            tax_amount: rounded.tax_amount,
            tax_exempt: isTaxExempt,
            svc_rate: svcRate,
            svc_amount: rounded.svc_amount,
            delivery_fee: rounded.delivery_fee,
            raw_total: raw_total,       // Precise 2dp total (for accounting/ledger)
            total: rounded.total        // Rounded to nearest 10 (customer-facing)
        };

        // 3. Update Order Record
        await tx.orders.update({
            where: { id: orderId },
            data: {
                tax: rounded.tax_amount,
                service_charge: rounded.svc_amount,
                delivery_fee: rounded.delivery_fee,
                discount: rounded.discount_amount,
                total: rounded.total,
                tax_type: currentTaxType,
                tax_exempt: isTaxExempt,
                breakdown: breakdown as any
            }
        });
    }

    async fireOrderToKitchen(orderId: string, io: any, metadata?: { staffId: string; sessionId?: string }): Promise<orders> {
        // 1. Validation before Firing
        const currentOrder = await this.getOrderDetails(orderId);
        if (!currentOrder) throw new Error('Order not found');

        const deliveryData = (currentOrder as any).delivery_orders?.[0] || {};
        const validation = this.validateOrder({
            ...currentOrder,
            status: currentOrder.status || 'ACTIVE',
            type: currentOrder.type as any,
            items: (currentOrder as any).order_items,
            customer_name: deliveryData.customer_name || currentOrder.customer_name,
            customer_phone: deliveryData.customer_phone || currentOrder.customer_phone,
            delivery_address: deliveryData.delivery_address || currentOrder.delivery_address
        } as any, 'FIRE');

        if (!validation.valid) {
            throw new Error(`Validation failed for firing: ${validation.errors.join(', ')}`);
        }

        return await prisma.$transaction(async (tx) => {
            // 2. Fetch order items with preparation requirements
            const items = await tx.order_items.findMany({
                where: { order_id: orderId },
                include: { menu_items: true }
            });

            // 2.1 Calculate new version number for batch
            const lastBatch = await tx.fire_batches.findFirst({
                where: { order_id: orderId },
                orderBy: { version_number: 'desc' }
            });
            const nextVersion = (lastBatch?.version_number || 0) + 1;

            // 2.2 Create Fire Batch
            const batch = await tx.fire_batches.create({
                data: {
                    order_id: orderId,
                    version_number: nextVersion,
                    created_by_user_id: metadata?.staffId || '00000000-0000-0000-0000-000000000000',
                    metadata_json: { sessionId: metadata?.sessionId }
                }
            });

            const updatedItems = [];

            // 2.3 Status Splitting: PENDING for items requiring prep, DONE for others
            for (const item of items) {
                // Only fire items that are currently DRAFT or were recalled
                if (item.item_status !== 'DRAFT') continue;

                const shouldFire = item.menu_items?.requires_prep ?? true;
                const newStatus = shouldFire ? 'PENDING' : 'DONE';

                const updatedItem = await tx.order_items.update({
                    where: { id: item.id },
                    data: {
                        item_status: newStatus as any,
                        fire_batch_id: batch.id,
                        fired_at: new Date(),
                        started_at: new Date(),
                        station_id: item.station_id || item.menu_items?.station_id,
                        status_updated_by: metadata?.staffId,
                        status_updated_at: new Date()
                    }
                });

                if (newStatus === 'PENDING') {
                    updatedItems.push(updatedItem);
                }
            }

            // 3. Update Overall Order Status to ACTIVE
            const order = await tx.orders.update({
                where: { id: orderId },
                data: {
                    status: 'ACTIVE',
                    updated_at: new Date(),
                    last_action_at: new Date(),
                    last_action_desc: `Order fired (Batch v${nextVersion})`
                }
            });

            // 4. Socket.IO Trigger
            if (updatedItems.length > 0) {
                io.to(`restaurant:${order.restaurant_id}`).emit('NEW_KITCHEN_ORDER', {
                    order_id: orderId,
                    restaurant_id: order.restaurant_id,
                    items: updatedItems,
                    fired_at: batch.created_at,
                    batch_id: batch.id,
                    version: nextVersion
                });
            }

            // 5. Fetch Final State for Socket Broadcast
            const finalOrder = await tx.orders.findUnique({
                where: { id: orderId },
                include: {
                    order_items: { include: { menu_item_variants: true } },
                    dine_in_orders: true, takeaway_orders: true, delivery_orders: true, reservation_orders: true
                }
            });

            if (finalOrder) {
                io.to(`restaurant:${finalOrder.restaurant_id}`).emit('db_change', { 
                    table: 'orders', 
                    eventType: 'UPDATE', 
                    data: finalOrder 
                });
            }

            return finalOrder || order;
        });
    }

    async recallOrderBatch(orderId: string, io: any, metadata: { staffId: string; sessionId?: string }): Promise<orders> {
        return await prisma.$transaction(async (tx) => {
            // 1. Find the latest active batch
            const latestBatch = await tx.fire_batches.findFirst({
                where: { order_id: orderId, recalled_at: null },
                orderBy: { created_at: 'desc' }
            });

            if (!latestBatch) {
                throw new Error('No active fire batch found to recall');
            }

            // 2. Check 60-second window
            const elapsedSeconds = (new Date().getTime() - latestBatch.created_at.getTime()) / 1000;
            if (elapsedSeconds > 60) {
                throw new Error('Recall window (60s) has expired. Manager approval required to skip items.');
            }

            // 3. Check if any items are already being prepared
            const itemsInBatch = await tx.order_items.findMany({
                where: { fire_batch_id: latestBatch.id }
            });

            const alreadyPreparing = itemsInBatch.some(it => it.item_status === 'PREPARING' || it.item_status === 'DONE');
            if (alreadyPreparing) {
                throw new Error('Some items in this batch are already being prepared. Cannot recall.');
            }

            // 4. Perform Recall
            await tx.fire_batches.update({
                where: { id: latestBatch.id },
                data: {
                    recalled_at: new Date(),
                    recalled_by: metadata.staffId
                }
            });

            // Revert items to DRAFT
            await tx.order_items.updateMany({
                where: { fire_batch_id: latestBatch.id, item_status: 'PENDING' },
                data: {
                    item_status: 'DRAFT' as any,
                    fire_batch_id: null,
                    fired_at: null,
                    status_updated_by: metadata.staffId,
                    status_updated_at: new Date()
                }
            });

            // 5. Notify KDS to remove items
            io.to(`restaurant:${latestBatch.order_id}`).emit('RECALL_KITCHEN_ORDER', {
                order_id: orderId,
                batch_id: latestBatch.id
            });

            const finalOrder = await tx.orders.findUnique({
                where: { id: orderId },
                include: { order_items: true }
            });
            if (!finalOrder) throw new Error('Order lost after recall');
            
            io.to(`restaurant:${finalOrder.restaurant_id}`).emit('db_change', {
                table: 'orders',
                eventType: 'UPDATE',
                data: finalOrder
            });

            return finalOrder;
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
            await tx.fire_batches.deleteMany({ where: { order_id: id } });
            await tx.order_intelligence.deleteMany({ where: { order_id: id } });
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
