import { Prisma } from '@prisma/client';
import { BaseOrderService } from './BaseOrderService';
import { CreateOrderDTO, UpdateOrderDTO } from './IOrderService';

export class DeliveryService extends BaseOrderService {

    validateOrder(data: CreateOrderDTO, context?: 'DRAFT' | 'FIRE'): { valid: boolean; errors: string[] } {
        const errors: string[] = this.validateCommon(data, context);
        if (context === 'FIRE') {
            if (!data.delivery_address) errors.push('delivery_address is required for firing DELIVERY');
            if (!data.customer_phone) errors.push('customer_phone is required for firing DELIVERY');
        }
        return { valid: errors.length === 0, errors };
    }

    protected async createExtension(tx: Prisma.TransactionClient, orderId: string, data: CreateOrderDTO): Promise<void> {
        let customerId: string | undefined;

        if (data.customer_phone && data.restaurant_id) {
            const customer = await tx.customers.upsert({
                where: {
                    restaurant_id_phone: {
                        restaurant_id: data.restaurant_id,
                        phone: data.customer_phone
                    }
                },
                update: {
                    name: data.customer_name || undefined,
                    address: data.delivery_address || undefined
                },
                create: {
                    restaurant_id: data.restaurant_id,
                    phone: data.customer_phone,
                    name: data.customer_name,
                    address: data.delivery_address
                }
            });
            customerId = customer.id;

            // Update main order customer_id
            await tx.orders.update({
                where: { id: orderId },
                data: { customer_id: customerId }
            });

            // Also ensure address is in address book if it's new
            if (data.delivery_address) {
                const existingAddress = await tx.customer_addresses.findFirst({
                    where: {
                        customer_id: customerId,
                        full_address: data.delivery_address
                    }
                });

                if (!existingAddress) {
                    await tx.customer_addresses.create({
                        data: {
                            customer_id: customerId,
                            label: 'Last Used',
                            full_address: data.delivery_address,
                            is_default: true
                        }
                    });
                }
            }
        }

        await tx.delivery_orders.create({
            data: {
                order_id: orderId,
                customer_name: data.customer_name,
                customer_phone: data.customer_phone,
                delivery_address: data.delivery_address,
                driver_id: data.driver_id,
                customer_id: customerId
            }
        });
    }

    protected async updateExtension(tx: Prisma.TransactionClient, orderId: string, data: UpdateOrderDTO): Promise<void> {
        // 1. Check if record exists
        const currentEntry = await tx.delivery_orders.findFirst({
            where: { order_id: orderId }
        });

        if (!currentEntry) {
            // Create if switching TO Delivery from another type
            await tx.delivery_orders.create({
                data: {
                    order_id: orderId,
                    customer_name: data.customer_name,
                    customer_phone: data.customer_phone,
                    delivery_address: data.delivery_address,
                    driver_id: data.driver_id
                }
            });
            return;
        }

        // 2. Update existing
        await tx.delivery_orders.updateMany({
            where: { order_id: orderId },
            data: {
                customer_name: data.customer_name,
                delivery_address: data.delivery_address,
                driver_id: data.driver_id
            }
        });
    }
}
