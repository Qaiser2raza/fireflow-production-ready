import { Prisma } from '@prisma/client';
import { BaseOrderService } from './BaseOrderService';
import { CreateOrderDTO, UpdateOrderDTO } from './IOrderService';

export class DeliveryService extends BaseOrderService {

    validateOrder(data: CreateOrderDTO): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        if (!data.delivery_address) errors.push('delivery_address is required for DELIVERY');
        if (!data.customer_phone) errors.push('customer_phone is required for DELIVERY');
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
