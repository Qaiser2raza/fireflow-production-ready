import { createClient } from '@supabase/supabase-js';
import { prisma } from '../../../shared/lib/prisma';

export async function syncMenuToCloud(restaurantId: string) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        console.log('[MENU SYNC] Skip: Cloud not configured.');
        return;
    }

    if (!restaurantId) {
        console.warn('[MENU SYNC] Skip: No restaurantId provided.');
        return;
    }

    try {
        const supabase = createClient(supabaseUrl, supabaseKey);

        console.log(`[MENU SYNC] 🔄 Starting full menu sync to cloud for restaurant ${restaurantId}...`);

        // 1. Sync Categories (for this restaurant only)
        const categories = await prisma.menu_categories.findMany({
            where: { restaurant_id: restaurantId }
        });
        for (const cat of categories) {
            await supabase.from('menu_categories_cloud').upsert({
                id: cat.id,
                restaurant_id: restaurantId,
                name: cat.name,
                sort_order: cat.priority || 0
            });
        }

        // 2. Sync Items (for this restaurant only)
        const items = await prisma.menu_items.findMany({
            where: { restaurant_id: restaurantId }
        });
        for (const item of items) {
            await supabase.from('menu_items_cloud').upsert({
                id: item.id,
                restaurant_id: restaurantId,
                category_id: item.category_id,
                name: item.name,
                description: item.description ?? null,
                price: Number(item.price),
                available: item.is_available ?? true,
                image_url: item.image_url
            });
        }

        console.log(`[MENU SYNC] ✅ Synced ${categories.length} categories and ${items.length} items for restaurant ${restaurantId}.`);
    } catch (err: any) {
        console.error('[MENU SYNC] ⚠️ Failed to sync menu to cloud:', err.message);
    }
}

