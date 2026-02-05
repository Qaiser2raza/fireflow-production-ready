import { Prisma } from '@prisma/client';
import { BaseOrderService } from './BaseOrderService';
import { CreateOrderDTO, UpdateOrderDTO } from './IOrderService';

export class TakeawayService extends BaseOrderService {

    validateOrder(data: CreateOrderDTO, context?: 'DRAFT' | 'FIRE'): { valid: boolean; errors: string[] } {
        const errors: string[] = this.validateCommon(data, context);
        // Takeaway specific firing validation
        if (context === 'FIRE') {
            // Add specific takeaway fire logic if any (e.g. token number already check handled in createExt)
        }
        return { valid: errors.length === 0, errors };
    }

    protected async createExtension(tx: Prisma.TransactionClient, orderId: string, data: CreateOrderDTO): Promise<void> {
        // 1. Get today's date for token tracking (YYYY-MM-DD)
        const today = new Date().toISOString().split('T')[0];

        // 2. Find all tokens created today to determine next number
        const todaysTakeawayOrders = await tx.takeaway_orders.findMany({
            where: {
                token_date: today
            },
            select: {
                token_number: true
            }
        });

        // 3. Extract numbers from existing tokens (e.g., "T001" -> 1)
        const existingTokenNumbers = todaysTakeawayOrders
            .map(order => {
                const match = order.token_number.match(/T(\d+)/);
                return match ? parseInt(match[1], 10) : 0;
            })
            .filter(n => n > 0);

        // 4. Calculate next token number
        const maxNumber = existingTokenNumbers.length > 0 ? Math.max(...existingTokenNumbers) : 0;
        const nextNumber = maxNumber + 1;

        // 5. Format as T### with leading zeros
        const tokenNumber = `T${String(nextNumber).padStart(3, '0')}`;

        // 6. Calculate estimated pickup time
        // Base: 10 minutes + 2 minutes per item (max 30 minutes)
        const itemCount = data.items?.length || 1;
        const baseMinutes = 10;
        const perItemMinutes = 2;
        const totalMinutes = Math.min(baseMinutes + (itemCount * perItemMinutes), 30);

        const pickupTime = new Date();
        pickupTime.setMinutes(pickupTime.getMinutes() + totalMinutes);

        // 7. Create takeaway order record with token
        await tx.takeaway_orders.create({
            data: {
                order_id: orderId,
                token_number: tokenNumber,
                token_date: today,
                customer_name: data.customer_name || 'Walk-in Customer',
                customer_phone: data.customer_phone,
                pickup_time: pickupTime,
                is_picked_up: false
            }
        });

        console.log(`✅ Generated takeaway token: ${tokenNumber} for ${today}, pickup time: ${totalMinutes} minutes`);
    }


    protected async updateExtension(tx: Prisma.TransactionClient, orderId: string, data: UpdateOrderDTO): Promise<void> {
        // Check if takeaway_orders record exists
        const existingTakeawayOrder = await tx.takeaway_orders.findFirst({
            where: { order_id: orderId }
        });

        // If no record exists (e.g., firing a draft for the first time), create one with token
        if (!existingTakeawayOrder) {
            // This is a draft being fired for the first time, create the takeaway_orders record
            const today = new Date().toISOString().split('T')[0];

            // Find all tokens created today to determine next number
            const todaysTakeawayOrders = await tx.takeaway_orders.findMany({
                where: { token_date: today },
                select: { token_number: true }
            });

            // Extract numbers from existing tokens
            const existingTokenNumbers = todaysTakeawayOrders
                .map(order => {
                    const match = order.token_number.match(/T(\d+)/);
                    return match ? parseInt(match[1], 10) : 0;
                })
                .filter(n => n > 0);

            // Calculate next token number
            const maxNumber = existingTokenNumbers.length > 0 ? Math.max(...existingTokenNumbers) : 0;
            const nextNumber = maxNumber + 1;
            const tokenNumber = `T${String(nextNumber).padStart(3, '0')}`;

            // Calculate estimated pickup time
            const itemCount = data.items?.length || 1;
            const totalMinutes = Math.min(10 + (itemCount * 2), 30);
            const pickupTime = new Date();
            pickupTime.setMinutes(pickupTime.getMinutes() + totalMinutes);

            // Create the takeaway order record
            await tx.takeaway_orders.create({
                data: {
                    order_id: orderId,
                    token_number: tokenNumber,
                    token_date: today,
                    customer_name: data.customer_name || 'Walk-in Customer',
                    customer_phone: data.customer_phone,
                    pickup_time: pickupTime,
                    is_picked_up: false
                }
            });

            console.log(`✅ Generated takeaway token on update: ${tokenNumber} for ${today}`);
            return;
        }

        // If record exists, update it
        const updateData: any = {};

        if (data.customer_name !== undefined) {
            updateData.customer_name = data.customer_name;
        }

        if (data.customer_phone !== undefined) {
            updateData.customer_phone = data.customer_phone;
        }

        // Allow marking as picked up
        if (data.is_picked_up !== undefined) {
            updateData.is_picked_up = data.is_picked_up;
            if (data.is_picked_up) {
                updateData.actual_pickup_time = new Date();
            }
        }

        // Only update if there's something to update
        if (Object.keys(updateData).length > 0) {
            await tx.takeaway_orders.updateMany({
                where: { order_id: orderId },
                data: updateData
            });
        }
    }
}