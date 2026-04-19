import { PrismaClient } from '@prisma/client';
import { JournalEntryService } from './src/api/services/JournalEntryService';

const prisma = new PrismaClient();
const journalEntryService = new JournalEntryService();

async function fix() {
    try {
        const restaurantId = 'b1972d7d-8374-4b55-9580-95a15f18f656';
        
        console.log("Seeding COA...");
        await journalEntryService.seedDefaultCOA(restaurantId);
        console.log("COA Seeded successfully!");

        console.log("Fixing tax_rate and svc_rate in operationsConfig...");
        
        // Find all order_type_defaults that have decimal values and update them
        const defaults = await prisma.order_type_defaults.findMany();
        
        for (const config of defaults) {
            let updated = false;
            let newTaxRate = Number(config.tax_rate);
            let newSvcRate = Number(config.svc_rate);

            if (newTaxRate < 1 && newTaxRate > 0) { // e.g. 0.16
                newTaxRate = newTaxRate * 100;
                updated = true;
            }
            if (newSvcRate < 1 && newSvcRate > 0) {
                newSvcRate = newSvcRate * 100;
                updated = true;
            }

            if (updated) {
                await prisma.order_type_defaults.update({
                    where: { id: config.id },
                    data: {
                        tax_rate: newTaxRate.toString(),
                        svc_rate: newSvcRate.toString()
                    }
                });
                console.log(`Updated config ID ${config.id} - Tax: ${newTaxRate}, SVC: ${newSvcRate}`);
            }
        }
        
        // Re-process the missed closed order(s) for Journal Entries
        console.log("Re-processing closed orders for ledger...");
        const orders = await prisma.orders.findMany({
            where: { restaurant_id: restaurantId, status: 'CLOSED' }
        });

        for (const order of orders) {
            console.log(`Processing Order Sale Journal for ${order.id}`);
            try {
                // Must pass a transaction, but we can pass prisma client
                await journalEntryService.recordOrderSaleJournal(order.id, prisma);
            } catch (e) {
                console.log(`Failed to process order ${order.id}:`, e.message);
            }
        }

        console.log("Done fixing DB!");

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

fix();
