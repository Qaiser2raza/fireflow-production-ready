import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const restaurant = await prisma.restaurants.findFirst()

    if (!restaurant) {
        console.error('No restaurant found. Please run the main seed first.')
        return
    }

    const stations = [
        { name: 'KITCHEN' },
        { name: 'TANDOOR' },
        { name: 'BAR' },
        { name: 'PANTY' },
        { name: 'COFFEE' }
    ]

    for (const station of stations) {
        await prisma.stations.upsert({
            where: {
                restaurant_id_name: {
                    restaurant_id: restaurant.id,
                    name: station.name
                }
            },
            update: {},
            create: {
                restaurant_id: restaurant.id,
                name: station.name,
                is_active: true
            }
        })
    }

    console.log('Stations seeded successfully.')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
