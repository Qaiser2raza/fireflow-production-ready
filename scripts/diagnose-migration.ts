import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔍 Diagnosing migration failure...');

    // 1. Check for audit_logs with session_id that doesn't exist in cashier_sessions
    const invalidSessions = await prisma.$queryRaw`
        SELECT DISTINCT session_id FROM audit_logs 
        WHERE session_id IS NOT NULL 
        AND CAST(session_id AS UUID) NOT IN (SELECT id FROM cashier_sessions)
    `;
    console.log('Invalid session_ids in audit_logs:', invalidSessions);

    // 2. Check for order_items with status_updated_by that doesn't exist in staff
    const invalidStaff = await prisma.$queryRaw`
        SELECT DISTINCT status_updated_by FROM order_items 
        WHERE status_updated_by IS NOT NULL 
        AND CAST(status_updated_by AS UUID) NOT IN (SELECT id FROM staff)
    `;
    console.log('Invalid status_updated_by in order_items:', invalidStaff);

    // 3. Check for approval_logs with target_entity_id that doesn't exist in orders (when it's an order)
    const invalidApprovalOrders = await prisma.$queryRaw`
        SELECT DISTINCT target_entity_id FROM approval_logs 
        WHERE target_entity_type = 'ORDER' 
        AND CAST(target_entity_id AS UUID) NOT IN (SELECT id FROM orders)
    `;
    console.log('Invalid order target_entity_ids in approval_logs:', invalidApprovalOrders);

    // 4. Check for orphaned approval_logs with restaurant_id that doesn't exist
    const invalidApprovalRestaurants = await prisma.$queryRaw`
        SELECT DISTINCT restaurant_id FROM approval_logs 
        WHERE CAST(restaurant_id AS UUID) NOT IN (SELECT id FROM restaurants)
    `;
    console.log('Invalid restaurant_ids in approval_logs:', invalidApprovalRestaurants);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
