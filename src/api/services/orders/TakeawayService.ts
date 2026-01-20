import { Prisma } from '@prisma/client';
import { BaseOrderService } from './BaseOrderService';
import { CreateOrderDTO, UpdateOrderDTO } from './IOrderService';

export class TakeawayService extends BaseOrderService {

    validateOrder(data: CreateOrderDTO): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        // Optional: you can enforce customer name for takeaway here if needed
        return { valid: errors.length === 0, errors };
    }

    protected async createExtension(tx: Prisma.TransactionClient, orderId: string, data: CreateOrderDTO): Promise<void> {
        // 1. Define the start of the current day
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        // 2. Count how many takeaway orders have been created today
        // This ensures the token resets to 1 every morning
        const todayCount = await tx.takeaway_orders.count({
            where: {
                order: {
                    created_at: {
                        gte: startOfDay
                    }
                }
            }
        });

        // 3. Generate the sequential token (e.g., T-1, T-2)
        const tokenToken = `T-${todayCount + 1}`;

        await tx.takeaway_orders.create({
            data: {
                order_id: orderId,
                token_number: tokenToken,
                customer_name: data.customer_name || 'Guest',
                customer_phone: data.customer_phone
            }
        });
    }

    protected async updateExtension(tx: Prisma.TransactionClient, orderId: string, data: UpdateOrderDTO): Promise<void> {
        if (data.customer_name || data.customer_phone) {
            await tx.takeaway_orders.updateMany({
                where: { order_id: orderId },
                data: {
                    customer_name: data.customer_name,
                    customer_phone: data.customer_phone
                }
            });
        }
    }
}