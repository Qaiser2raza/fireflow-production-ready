// scripts/seed-order-charges.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const restaurant = await prisma.restaurants.findFirst();
  if (!restaurant) { console.log('No restaurant found'); return; }

  await prisma.restaurant_features.upsert({
    where: { restaurant_id: restaurant.id },
    update: {
      features: {
        order_type_charges: {
          DINE_IN: {
            tax_enabled: false,
            service_charge_enabled: true,
            discount_enabled: false,
            delivery_fee_enabled: false
          },
          TAKEAWAY: {
            tax_enabled: false,
            service_charge_enabled: false,
            discount_enabled: true,
            delivery_fee_enabled: false
          },
          DELIVERY: {
            tax_enabled: false,
            service_charge_enabled: false,
            discount_enabled: true,
            delivery_fee_enabled: true,
            delivery_fee_type: 'FLAT',
            delivery_fee_amount: 150
          }
        }
      }
    },
    create: {
      restaurant_id: restaurant.id,
      features: {
        order_type_charges: {
          DINE_IN: {
            tax_enabled: false,
            service_charge_enabled: true,
            discount_enabled: false,
            delivery_fee_enabled: false
          },
          TAKEAWAY: {
            tax_enabled: false,
            service_charge_enabled: false,
            discount_enabled: true,
            delivery_fee_enabled: false
          },
          DELIVERY: {
            tax_enabled: false,
            service_charge_enabled: false,
            discount_enabled: true,
            delivery_fee_enabled: true,
            delivery_fee_type: 'FLAT',
            delivery_fee_amount: 150
          }
        }
      }
    }
  });

  console.log('✅ Order type charges seeded for:', restaurant.name);
}

main().finally(() => prisma.$disconnect());
