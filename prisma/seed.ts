import { PrismaClient, OrderStatus, OrderType, TableStatus, ItemStatus } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  console.log('🔄 Starting Database Reset and Seed...')

  // 1. Clear Existing Data (Order matters due to foreign keys)
  console.log('🗑️  Clearing existing data...')

  // Detail/Transaction tables first
  await prisma.order_items.deleteMany({})
  await prisma.dine_in_orders.deleteMany({})
  await prisma.takeaway_orders.deleteMany({})
  await prisma.delivery_orders.deleteMany({})
  await prisma.reservation_orders.deleteMany({})
  await prisma.orders.deleteMany({})
  await prisma.transactions.deleteMany({})
  await prisma.audit_logs.deleteMany({})
  await prisma.staff_wallet_logs.deleteMany({})
  await prisma.rider_settlements.deleteMany({})
  await prisma.expenses.deleteMany({})
  await prisma.reservations.deleteMany({})
  await prisma.registered_devices.deleteMany({})
  await prisma.pairing_codes.deleteMany({})
  await prisma.license_keys.deleteMany({})
  await prisma.security_events.deleteMany({})
  await prisma.installation_logs.deleteMany({})

  // Master tables
  await prisma.tables.deleteMany({})
  await prisma.sections.deleteMany({})
  await prisma.menu_items.deleteMany({})
  await prisma.menu_categories.deleteMany({})
  await prisma.stations.deleteMany({})
  await prisma.staff.deleteMany({})
  await prisma.customers.deleteMany({})
  await prisma.vendors.deleteMany({})
  await prisma.restaurants.deleteMany({})

  console.log('✅ Database cleared.')

  // 2. Create Restaurant
  console.log('🏗️  Seeding Restaurant...')
  const restaurant = await prisma.restaurants.create({
    data: {
      name: 'Fireflow Premium POS',
      slug: 'fireflow-main',
      currency: 'PKR',
      address: 'DHA Phase 6, Lahore',
      phone: '+92 300 1234567',
      is_active: true,
      tax_enabled: true,
      tax_rate: 16,
      service_charge_enabled: true,
      service_charge_rate: 10,
    },
  })

  // 3. Create Stations
  console.log('🏗️  Seeding Stations...')
  const kitchen = await prisma.stations.create({
    data: { restaurant_id: restaurant.id, name: 'KITCHEN' }
  })
  const tandoor = await prisma.stations.create({
    data: { restaurant_id: restaurant.id, name: 'TANDOOR' }
  })
  const bar = await prisma.stations.create({
    data: { restaurant_id: restaurant.id, name: 'BAR' }
  })
  const dessert = await prisma.stations.create({
    data: { restaurant_id: restaurant.id, name: 'DESSERT' }
  })

  // 4. Create Menu Categories
  console.log('🏗️  Seeding Categories...')
  const catStarters = await prisma.menu_categories.create({
    data: { restaurant_id: restaurant.id, name: 'Starters', priority: 1 }
  })
  const catMains = await prisma.menu_categories.create({
    data: { restaurant_id: restaurant.id, name: 'Mains', priority: 2 }
  })
  const catBBQ = await prisma.menu_categories.create({
    data: { restaurant_id: restaurant.id, name: 'BBQ Special', priority: 3 }
  })
  const catDrinks = await prisma.menu_categories.create({
    data: { restaurant_id: restaurant.id, name: 'Beverages', priority: 4 }
  })
  const catBreads = await prisma.menu_categories.create({
    data: { restaurant_id: restaurant.id, name: 'Fresh Breads', priority: 5 }
  })

  // 5. Create Menu Items
  console.log('🏗️  Seeding Menu Items...')
  const menuItems = [
    // Starters
    { name: 'Chicken Corn Soup', price: 450, category_id: catStarters.id, station_id: kitchen.id },
    { name: 'Finger Fish', price: 1200, category_id: catStarters.id, station_id: kitchen.id },

    // Mains
    { name: 'Chicken Karahi (Full)', price: 2800, category_id: catMains.id, station_id: kitchen.id },
    { name: 'Mutton Handi', price: 3500, category_id: catMains.id, station_id: kitchen.id },
    { name: 'Chicken Jalfrezi', price: 1800, category_id: catMains.id, station_id: kitchen.id },

    // BBQ
    { name: 'Chicken Tikka', price: 450, category_id: catBBQ.id, station_id: tandoor.id },
    { name: 'Seekh Kabab (4 pcs)', price: 1100, category_id: catBBQ.id, station_id: tandoor.id },
    { name: 'Malai Boti', price: 1400, category_id: catBBQ.id, station_id: tandoor.id },

    // Breads
    { name: 'Roti (Tandoori)', price: 40, category_id: catBreads.id, station_id: tandoor.id },
    { name: 'Naan (Plain)', price: 60, category_id: catBreads.id, station_id: tandoor.id },
    { name: 'Garlic Naan', price: 120, category_id: catBreads.id, station_id: tandoor.id },

    // Drinks
    { name: 'Mint Margarita', price: 550, category_id: catDrinks.id, station_id: bar.id },
    { name: 'Fresh Lime', price: 250, category_id: catDrinks.id, station_id: bar.id },
    { name: 'Coke/Pepsi', price: 120, category_id: catDrinks.id, station_id: bar.id },
  ]

  for (const item of menuItems) {
    const categoryName = [catStarters, catMains, catBBQ, catDrinks, catBreads].find(c => c.id === item.category_id)?.name || 'General';
    await prisma.menu_items.create({
      data: {
        ...item,
        restaurant_id: restaurant.id,
        category: categoryName,
        is_available: true,
        requires_prep: true,
      }
    })
  }

  // 6. Create Sections and Tables
  console.log('🏗️  Seeding Sections and Tables...')
  const mainHall = await prisma.sections.create({
    data: { restaurant_id: restaurant.id, name: 'Main Hall', type: 'DINING', priority: 1 }
  })
  const terrace = await prisma.sections.create({
    data: { restaurant_id: restaurant.id, name: 'Terrace', type: 'DINING', priority: 2 }
  })
  const vipRoom = await prisma.sections.create({
    data: { restaurant_id: restaurant.id, name: 'VIP Room', type: 'DINING', priority: 3 }
  })

  // Create tables for Main Hall (10 tables)
  for (let i = 1; i <= 10; i++) {
    await prisma.tables.create({
      data: {
        restaurant_id: restaurant.id,
        section_id: mainHall.id,
        name: `H-${i.toString().padStart(2, '0')}`,
        capacity: 4,
        status: 'AVAILABLE',
      }
    })
  }

  // Create tables for Terrace (5 tables)
  for (let i = 1; i <= 5; i++) {
    await prisma.tables.create({
      data: {
        restaurant_id: restaurant.id,
        section_id: terrace.id,
        name: `T-${i.toString().padStart(2, '0')}`,
        capacity: 2,
        status: 'AVAILABLE',
      }
    })
  }

  // Create tables for VIP (2 tables)
  for (let i = 1; i <= 2; i++) {
    await prisma.tables.create({
      data: {
        restaurant_id: restaurant.id,
        section_id: vipRoom.id,
        name: `VIP-${i}`,
        capacity: 8,
        status: 'AVAILABLE',
      }
    })
  }

  // 7. Create Staff
  console.log('🏗️  Seeding Staff...')
  const staffData = [
    { name: 'Admin Ali', role: 'MANAGER', pin: '0000' },
    { name: 'Cashier Khan', role: 'CASHIER', pin: '1111' },
    { name: 'Waiter Ahmed', role: 'WAITER', pin: '2222' },
    { name: 'Waiter Bilal', role: 'WAITER', pin: '3333' },
    { name: 'Rider Raza', role: 'RIDER', pin: '4444' },
    { name: 'Rider Salman', role: 'RIDER', pin: '5555' },
  ]

  for (const s of staffData) {
    await prisma.staff.create({
      data: {
        restaurant_id: restaurant.id,
        name: s.name,
        role: s.role,
        pin: s.pin, // In real app, this should be hashed if using hashed_pin field
        status: 'active'
      }
    })
  }

  // 8. Create Customers
  console.log('🏗️  Seeding Customers...')
  const customers = [
    { name: 'Qaiser Raza', phone: '03001234567', address: 'DHA Lahore' },
    { name: 'Zaid Alvi', phone: '03007654321', address: 'Gulberg Lahore' },
    { name: 'Umar Khalid', phone: '03211112222', address: 'Johar Town Lahore' },
  ]

  for (const c of customers) {
    await prisma.customers.create({
      data: {
        restaurant_id: restaurant.id,
        ...c
      }
    })
  }

  // 9. Create Vendors
  console.log('🏗️  Seeding Vendors...')
  const vendors = [
    { name: 'Alpha Poultry', phone: '03451112223', category: 'Meat' },
    { name: 'Green Fresh Veggies', phone: '03454445556', category: 'Produce' },
    { name: 'Beverage Solutions', phone: '03459998887', category: 'Drinks' },
  ]

  for (const v of vendors) {
    await prisma.vendors.create({
      data: {
        restaurant_id: restaurant.id,
        ...v
      }
    })
  }

  console.log('🚀 Seed completed successfully!')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })