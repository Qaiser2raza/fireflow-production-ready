
import { prisma } from '../../shared/lib/prisma';
import { TableStatus, Section, Table } from '../../shared/types';
import { Server } from 'socket.io';
import { Prisma } from '@prisma/client';

async function findBestTable(restaurantId: string, guestCount: number, sectionId?: string) {
    const where: any = {
        restaurant_id: restaurantId,
        status: TableStatus.AVAILABLE,
        capacity: { gte: guestCount }
    };
    if (sectionId) where.section_id = sectionId;

    return await prisma.tables.findFirst({
        where,
        orderBy: { capacity: 'asc' },
        include: { sections: true }
    });
}

export async function seatPartyWithCapacityCheck(
    restaurantId: string,
    guestCount: number,
    customerName: string = 'Guest',
    waiterId: string,
    io?: Server,
    preferredSectionId?: string,
    allowOverCapacity: boolean = true,
    tableId?: string
) {
    let table: any = null;

    if (tableId) {
        // Direct table selection
        table = await prisma.tables.findFirst({
            where: { id: tableId, restaurant_id: restaurantId },
            include: { sections: true }
        });
    } else {
        // Auto-find best table
        table = await findBestTable(restaurantId, guestCount, preferredSectionId);
    }

    if (!table) {
        table = await prisma.tables.findFirst({
            where: {
                restaurant_id: restaurantId,
                section_id: preferredSectionId,
                status: TableStatus.AVAILABLE,
                capacity: { gte: Math.max(2, guestCount - 2) }
            },
            orderBy: { capacity: 'desc' },
            include: { sections: true }
        });
    }

    if (!table) {
        // Fallback: Find ANY available table if preference failed
        table = await prisma.tables.findFirst({
            where: {
                restaurant_id: restaurantId,
                status: TableStatus.AVAILABLE
            },
            orderBy: { capacity: 'desc' },
            include: { sections: true }
        });
    }

    if (!table) throw new Error('No suitable tables available');
    const isOverCapacity = guestCount > table.capacity;

    if (isOverCapacity && !allowOverCapacity) {
        throw new Error(`Guest count (${guestCount}) exceeds table capacity (${table.capacity})`);
    }

    // Validate Waiter (Self-Healing for Stale IDs)
    let finalWaiterId = waiterId;
    const waiterCount = await prisma.staff.count({ where: { id: waiterId } });
    if (waiterCount === 0) {
        console.warn(`[FloorService] Stale Waiter ID ${waiterId} detected. Auto-healing...`);
        const fallbackStaff = await prisma.staff.findFirst({ where: { restaurant_id: restaurantId } });
        if (fallbackStaff) finalWaiterId = fallbackStaff.id;
    }

    const result = await prisma.$transaction(async (tx) => {
        const timestamp = new Date();
        const order_number = `ORD-${timestamp.getHours()}${timestamp.getMinutes()}${timestamp.getSeconds()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

        const order = await tx.orders.create({
            data: {
                restaurant_id: restaurantId,
                order_number,
                type: 'DINE_IN',
                status: 'ACTIVE', // v3.0: Changed from CONFIRMED
                payment_status: 'UNPAID', // v3.0: Added explicit payment status
                guest_count: guestCount,
                customer_name: customerName,
                assigned_waiter_id: finalWaiterId,
                table_id: table!.id,
                last_action_by: finalWaiterId,
                last_action_desc: isOverCapacity
                    ? `Party seated (${guestCount} guests, table capacity ${table!.capacity})`
                    : 'Party seated'
            } as any
        });

        const updatedTable = await tx.tables.update({
            where: { id: table!.id },
            data: {
                status: TableStatus.OCCUPIED,
                active_order_id: order.id
            }
        });

        const dineIn = await tx.dine_in_orders.create({
            data: {
                order_id: order.id,
                table_id: table!.id,
                guest_count: guestCount,
                waiter_id: finalWaiterId,
                guest_count_history: isOverCapacity
                    ? JSON.stringify([{
                        count: guestCount,
                        timestamp: new Date(),
                        capacity: table!.capacity,
                        over_capacity: true,
                        staff_id: finalWaiterId
                    }])
                    : Prisma.JsonNull
            }
        });

        if (isOverCapacity) {
            await tx.audit_logs.create({
                data: {
                    restaurant_id: restaurantId,
                    staff_id: waiterId,
                    action_type: 'GUEST_OVER_CAPACITY',
                    entity_type: 'ORDER',
                    entity_id: order.id,
                    details: {
                        table_id: table!.id,
                        table_name: table!.name,
                        table_capacity: table!.capacity,
                        guest_count: guestCount,
                        over_by: guestCount - table!.capacity,
                        reason: 'Initial seating'
                    }
                }
            });
        }

        return { order, table: updatedTable, dineInOrder: dineIn, isOverCapacity };
    });

    if (io) {
        io.to(`restaurant:${restaurantId}`).emit('party:seated', {
            orderId: result.order.id,
            tableId: result.table.id,
            tableName: result.table.name,
            guestCount,
            customerName,
            waiterId,
            isOverCapacity: result.isOverCapacity,
            capacityWarning: result.isOverCapacity
                ? `${guestCount - result.table.capacity} guests over capacity`
                : null,
            timestamp: new Date()
        });
    }

    return {
        order: result.order,
        table: result.table,
        dineInOrder: result.dineInOrder,
        warning: result.isOverCapacity
            ? {
                type: 'OVER_CAPACITY',
                message: `Table capacity is ${result.table.capacity} - ${guestCount - result.table.capacity} extra chairs needed`,
                table_capacity: result.table.capacity,
                guest_count: guestCount
            }
            : null
    };
}

export async function updateGuestCount(
    orderId: string,
    newGuestCount: number,
    staffId: string,
    io?: Server,
    allowOverCapacity: boolean = true
) {
    const order = await prisma.orders.findUnique({
        where: { id: orderId },
        include: {
            tables: true,
            dine_in_orders: true
        }
    });

    if (!order) {
        throw new Error('Order not found');
    }

    const closedStatuses: string[] = ['CLOSED', 'CANCELLED', 'VOIDED'];
    if (closedStatuses.includes(order.status || '') || order.payment_status === 'PAID') {
        throw new Error(`Cannot update guest count - order status is ${order.status}`);
    }

    const isOverCapacity = order.tables && newGuestCount > order.tables.capacity;

    if (isOverCapacity && !allowOverCapacity) {
        throw new Error(
            `Guest count (${newGuestCount}) exceeds table capacity (${order.tables?.capacity})`
        );
    }

    const result = await prisma.$transaction(async (tx) => {
        const updatedOrder = await tx.orders.update({
            where: { id: orderId },
            data: {
                guest_count: newGuestCount,
                last_action_by: staffId,
                last_action_at: new Date(),
                last_action_desc: `Guest count updated to ${newGuestCount}`
            }
        });

        const currentHistory = order.dine_in_orders?.guest_count_history as any[] || [];
        currentHistory.push({
            count: newGuestCount,
            timestamp: new Date(),
            capacity: order.tables?.capacity,
            over_capacity: isOverCapacity,
            staff_id: staffId
        });

        const updatedDineIn = await tx.dine_in_orders.update({
            where: { order_id: orderId },
            data: {
                guest_count: newGuestCount,
                guest_count_history: JSON.stringify(currentHistory)
            }
        });

        if (isOverCapacity) {
            await tx.audit_logs.create({
                data: {
                    restaurant_id: order.restaurant_id,
                    staff_id: staffId,
                    action_type: 'GUEST_OVER_CAPACITY',
                    entity_type: 'ORDER',
                    entity_id: orderId,
                    details: {
                        table_id: order.table_id,
                        table_name: order.tables?.name,
                        table_capacity: order.tables?.capacity,
                        old_guest_count: order.guest_count,
                        new_guest_count: newGuestCount,
                        over_by: newGuestCount - (order.tables?.capacity || 0),
                        reason: 'Guest count updated during service'
                    }
                }
            });
        }

        return { updatedOrder, updatedDineIn };
    });

    if (io) {
        io.to(`restaurant:${order.restaurant_id}`).emit('order:guest-count-updated', {
            orderId,
            tableId: order.table_id,
            oldGuestCount: order.guest_count,
            newGuestCount,
            isOverCapacity,
            timestamp: new Date()
        });
    }

    return {
        order: result.updatedOrder,
        warning: isOverCapacity
            ? {
                type: 'OVER_CAPACITY',
                message: `${newGuestCount - (order.tables?.capacity || 0)} guests over table capacity`,
                table_capacity: order.tables?.capacity,
                guest_count: newGuestCount
            }
            : null
    };
}

// --- SECTION MANAGEMENT ---

export async function createSection(data: any, io?: Server): Promise<Section> {
    const section = await prisma.sections.create({ data }) as unknown as Section;
    if (io) io.emit('db_change', { table: 'sections', eventType: 'INSERT', data: section });
    return section;
}

export async function updateSection(id: string, restaurantId: string, data: any, io?: Server): Promise<Section> {
    const section = await prisma.sections.update({
        where: { id, restaurant_id: restaurantId },
        data
    }) as unknown as Section;
    if (io) io.emit('db_change', { table: 'sections', eventType: 'UPDATE', data: section });
    return section;
}

export async function deleteSection(id: string, io?: Server) {
    await prisma.sections.delete({ where: { id } });
    if (io) io.emit('db_change', { table: 'sections', eventType: 'DELETE', id });
    return { success: true };
}

export async function reorderSections(restaurantId: string, reorderedIds: string[], io?: Server) {
    const updates = reorderedIds.map((id, index) =>
        prisma.sections.update({
            where: { id, restaurant_id: restaurantId },
            data: { priority: index }
        })
    );
    await prisma.$transaction(updates);
    if (io) io.emit('db_change', { table: 'sections', eventType: 'UPDATE', data: { reordered: true } });
    return { success: true };
}

// --- TABLE MANAGEMENT ---

export async function createTable(data: any, io?: Server): Promise<Table> {
    const table = await prisma.tables.create({ data }) as unknown as Table;
    if (io) io.emit('db_change', { table: 'tables', eventType: 'INSERT', data: table });
    return table;
}

export async function updateTable(id: string, restaurantId: string, data: any, io?: Server): Promise<Table> {
    const table = await prisma.tables.update({
        where: { id, restaurant_id: restaurantId },
        data
    }) as unknown as Table;
    if (io) io.emit('db_change', { table: 'tables', eventType: 'UPDATE', data: table });
    return table;
}

export async function deleteTable(id: string, io?: Server) {
    await prisma.tables.delete({ where: { id } });
    if (io) io.emit('db_change', { table: 'tables', eventType: 'DELETE', id });
    return { success: true };
}

export async function getFloorLayout(restaurantId: string) {
    const [sections, tables] = await Promise.all([
        prisma.sections.findMany({
            where: { restaurant_id: restaurantId },
            orderBy: { priority: 'asc' }
        }),
        prisma.tables.findMany({
            where: { restaurant_id: restaurantId },
            orderBy: { name: 'asc' }
        })
    ]);

    return { sections, tables };
}

export async function releaseTable(id: string, restaurantId: string, io?: Server) {
    const table = await prisma.tables.update({
        where: { id, restaurant_id: restaurantId },
        data: {
            status: TableStatus.AVAILABLE,
            active_order_id: null
        }
    });

    if (io) {
        io.to(`restaurant:${restaurantId}`).emit('db_change', {
            table: 'tables',
            eventType: 'UPDATE',
            data: table
        });
    }

    return table;
}
