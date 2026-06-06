import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface MenuCategory {
  id: string;
  name: string;
  sort_order: number;
}

export interface MenuItem {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  available: boolean;
  image_url: string | null;
}

export function useMenu(restaurantId: string | null) {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId) {
      setError('No restaurant found. Please scan a valid QR code.');
      setLoading(false);
      return;
    }

    async function fetchMenu() {
      setLoading(true);
      setError(null);
      try {
        const [catResult, itemResult] = await Promise.all([
          supabase
            .from('menu_categories_cloud')
            .select('id, name, sort_order')
            .eq('restaurant_id', restaurantId)
            .order('sort_order'),
          supabase
            .from('menu_items_cloud')
            .select('id, category_id, name, description, price, available, image_url')
            .eq('restaurant_id', restaurantId)
            .eq('available', true),
        ]);

        if (catResult.error) throw catResult.error;
        if (itemResult.error) throw itemResult.error;

        setCategories(catResult.data || []);
        setItems(itemResult.data || []);
      } catch (err: any) {
        setError('Unable to load menu. Please try again.');
        console.error('[FireFlow PWA] Menu fetch error:', err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchMenu();
  }, [restaurantId]);

  return { categories, items, loading, error };
}
