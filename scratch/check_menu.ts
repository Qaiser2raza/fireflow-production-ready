import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkMenu() {
  try {
    const totalItems = await prisma.menu_items.count();
    
    // Check for variants using the correct relation
    const totalVariantsCount = await prisma.menu_item_variants.count();

    const itemsWithVariants = await prisma.menu_items.findMany({
      where: {
        menu_item_variants: {
          some: {}
        }
      },
      include: {
        menu_item_variants: true
      },
      take: 5
    });

    console.log(`Total Menu Items: ${totalItems}`);
    console.log(`Total Variants across all items: ${totalVariantsCount}`);
    
    if (itemsWithVariants.length > 0) {
      console.log('Sample Items with Variants:');
      itemsWithVariants.forEach(item => {
        console.log(`- ${item.name} has ${item.menu_item_variants.length} variants:`);
        item.menu_item_variants.forEach(v => {
          console.log(`  * ${v.name} (PKR ${v.price})`);
        });
      });
    } else {
      console.log('No menu items with variants found.');
    }

  } catch (error) {
    console.error('Error querying database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkMenu();
