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
        await tx.delivery_orders.create({
            data: {
                order_id: orderId,
                customer_name: data.customer_name,
                customer_phone: data.customer_phone,
                delivery_address: data.delivery_address,
                driver_id: data.driver_id
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
