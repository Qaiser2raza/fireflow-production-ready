import { Prisma } from '@prisma/client';
import { BaseOrderService } from './BaseOrderService';
import { CreateOrderDTO, UpdateOrderDTO } from './IOrderService';

export class ReservationService extends BaseOrderService {

    validateOrder(data: CreateOrderDTO): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        if (!data.reservation_time) errors.push('reservation_time is required for RESERVATION');
        return { valid: errors.length === 0, errors };
    }

    protected async createExtension(tx: Prisma.TransactionClient, orderId: string, data: CreateOrderDTO): Promise<void> {
        await tx.reservation_orders.create({
            data: {
                order_id: orderId,
                customer_name: data.customer_name,
                customer_phone: data.customer_phone,
                reservation_time: new Date(data.reservation_time),
                guest_count: Number(data.guest_count || 2),
                table_id: data.table_id,
                arrival_status: 'PENDING'
            }
        });
    }

    protected async updateExtension(tx: Prisma.TransactionClient, orderId: string, data: UpdateOrderDTO): Promise<void> {
        await tx.reservation_orders.updateMany({
            where: { order_id: orderId },
            data: {
                reservation_time: data.reservation_time ? new Date(data.reservation_time) : undefined,
                table_id: data.table_id,
                arrival_status: data.arrival_status
            }
        });
    }
}
