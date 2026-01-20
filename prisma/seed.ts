import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // 1. Create or get Restaurant
  let restaurant = await prisma.restaurants.findUnique({
    where: { slug: 'fireflow-main' }
  })
  
  if (!restaurant) {
    restaurant = await prisma.restaurants.create({
      data: {
        name: 'Fireflow',
        slug: 'fireflow-main',
        currency: 'PKR',
      },
    })
  }

  // 2. Create Section (Hall)
  const section = await prisma.sections.create({
    data: {
      restaurant_id: restaurant.id,
      name: 'Main Hall',
      type: 'DINING',
    },
  })

  // 3. Create a Table
  await prisma.tables.create({
    data: {
      restaurant_id: restaurant.id,
      section_id: section.id,
      name: 'T-01',
      capacity: 4,
      status: 'AVAILABLE',
    },
  })

  // 4. Create Manager Staff
  await prisma.staff.create({
    data: {
      restaurant_id: restaurant.id,
      name: 'Admin Manager',
      role: 'MANAGER',
      pin: '1234', // In production, this would be hashed
    },
  })

  // 5. Create the "Per-Head" Roti
  await prisma.menu_items.create({
    data: {
      name: 'Roti (Per Head)',
      name_urdu: 'روٹی',
      price: 50.00,
      cost_price: 10.00,
      category: 'Breads',
      station: 'TANDOOR',
      restaurants: { connect: { id: restaurant.id } }
    },
  })

  console.log('Seed completed successfully.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })