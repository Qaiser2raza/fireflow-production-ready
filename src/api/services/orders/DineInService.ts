// E:\firefox3\Fireflow\src\services\orders\DineInService.ts

import { Prisma } from '@prisma/client';
import { BaseOrderService } from './BaseOrderService';
import { CreateOrderDTO, UpdateOrderDTO } from './IOrderService';

export class DineInService extends BaseOrderService {

    validateOrder(data: CreateOrderDTO): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        if (!data.table_id) errors.push('table_id is required for DINE_IN');
        if (!data.guest_count) errors.push('guest_count is required for DINE_IN');
        return { valid: errors.length === 0, errors };
    }

    protected async createExtension(tx: Prisma.TransactionClient, orderId: string, data: CreateOrderDTO): Promise<void> {
        await tx.dine_in_orders.create({
            data: {
                order_id: orderId,
                table_id: data.table_id,
                guest_count: Number(data.guest_count),
                waiter_id: data.waiter_id,
                seated_at: new Date()
            }
        });

        // Update table status to OCCUPIED
        await tx.tables.update({
            where: { id: data.table_id },
            data: { status: 'OCCUPIED' }
        });
    }

    protected async updateExtension(tx: Prisma.TransactionClient, orderId: string, data: UpdateOrderDTO): Promise<void> {
        if (data.guest_count || data.table_id) {
            // 1. Fetch current data to check for reduction (Audit Logic)
            const currentEntry = await tx.dine_in_orders.findFirst({
                where: { order_id: orderId }
            });

            const newCount = data.guest_count ? Number(data.guest_count) : currentEntry?.guest_count;

            // 2. If guest count is reduced, we log it to audit_logs
            if (currentEntry && newCount < currentEntry.guest_count) {
                await tx.audit_logs.create({
                    data: {
                        action_type: 'GUEST_COUNT_REDUCTION',
                        entity_type: 'DINE_IN_ORDER',
                        entity_id: currentEntry.id,
                        staff_id: data.authorized_by, // This comes from the Manager PIN entry in UI
                        details: {
                            old_count: currentEntry.guest_count,
                            new_count: newCount,
                            reason: 'Manual correction or error'
                        }
                    }
                });
            }

            // 3. Perform the actual update
            await tx.dine_in_orders.updateMany({
                where: { order_id: orderId },
                data: {
                    guest_count: newCount,
                    table_id: data.table_id
                }
            });
        }
    }
}