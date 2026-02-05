import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const imageMap: Record<string, string> = {
    'Chicken Corn Soup': 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=800&q=80',
    'Finger Fish': 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=800&q=80',
    'Chicken Karahi (Full)': 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=800&q=80',
    'Mutton Handi': 'https://images.unsplash.com/photo-1545240681-30889f417571?auto=format&fit=crop&w=800&q=80',
    'Chicken Jalfrezi': 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80',
    'Chicken Tikka': 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=800&q=80',
    'Seekh Kabab (4 pcs)': 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?auto=format&fit=crop&w=800&q=80',
    'Malai Boti': 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&w=800&q=80',
    'Roti (Tandoori)': 'https://images.unsplash.com/photo-1533777324545-e0169353245e?auto=format&fit=crop&w=800&q=80',
    'Naan (Plain)': 'https://images.unsplash.com/photo-1601050690597-df056fbec7af?auto=format&fit=crop&w=800&q=80',
    'Garlic Naan': 'https://images.unsplash.com/photo-1601050690597-df056fbec7af?auto=format&fit=crop&w=800&q=80',
    'Mint Margarita': 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=800&q=80',
    'Fresh Lime': 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=800&q=80',
    'Coke/Pepsi': 'https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=800&q=80'
};

async function run() {
    console.log('🖼️  Updating Menu Item Images...');

    const items = await prisma.menu_items.findMany();

    for (const item of items) {
        const imageUrl = imageMap[item.name];
        if (imageUrl) {
            await prisma.menu_items.update({
                where: { id: item.id },
                data: { image_url: imageUrl }
            });
            console.log(`✅ Updated ${item.name}`);
        }
    }

    console.log('✨ All menu items updated successfully!');
    process.exit(0);
}

run();
