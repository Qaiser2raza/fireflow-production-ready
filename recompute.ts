import { PrismaClient } from '@prisma/client';
import { JournalEntryService } from './src/api/services/JournalEntryService';
import { PosOrderService } from './src/api/services/orders/PosOrderService';

const prisma = new PrismaClient();
const journalEntryService = new JournalEntryService();
const posOrderService = new PosOrderService();

async function recompute() {
    try {
        const orderId = 'd4bbd674-b6de-402e-84b4-dd43ae4453cf';

        // Set the svc_enabled back to true in DB for Dine-In to fix the discrepancy
        const config = await prisma.order_type_defaults.findFirst({
            where: { restaurant_id: 'b1972d7d-8374-4b55-9580-95a15f18f656', order_type: 'DINE_IN' }
        });
        
        await prisma.order_type_defaults.update({
            where: { id: config!.id },
            data: { svc_enabled: true, svc_rate: '6' }
        });

        console.log("Triggering recompute for order...", orderId);
        await posOrderService.updateOrder(orderId, { update_reason: 'Fixing DB totals' });

        const updatedOrder = await prisma.orders.findUnique({ where: { id: orderId }});
        console.log(`Updated Order Totals -> Total: ${updatedOrder.total}, Tax: ${updatedOrder.tax}, SC: ${updatedOrder.service_charge}`);

        console.log("Running journal post...");
        await journalEntryService.recordOrderSaleJournal(orderId, prisma);
        console.log("SUCCESS!");
    } catch(e) {
        console.error("FAIL:", e);
    } finally {
        await prisma.$disconnect();
    }
}
recompute();
