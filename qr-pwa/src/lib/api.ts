import { supabase } from './supabase';

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  menu_categories?: { name: string };
  available: boolean;
  variant?: any[];
}

// Memory cache
let cachedRestaurantId: string | null = null;

export async function getRestaurantId(slug: string): Promise<string> {
  if (cachedRestaurantId) return cachedRestaurantId;
  const { data, error } = await supabase
    .from('restaurants_cloud')
    .select('restaurant_id')
    .eq('slug', slug)
    .single();
    
  if (error || !data) throw new Error('Restaurant not found');
  cachedRestaurantId = data.restaurant_id;
  return data.restaurant_id;
}

export async function fetchMenu(slug: string) {
  const restaurantId = await getRestaurantId(slug);
  const { data, error } = await supabase
    .from('menu_items_cloud')
    .select(`
      id, name, description, price, available,
      menu_categories_cloud(name)
    `)
    .eq('restaurant_id', restaurantId)
    .eq('available', true);
    
  if (error) throw new Error('Failed to fetch menu');
  
  // Map back to expected structure
  return data.map((item: any) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    price: Number(item.price),
    available: item.available,
    menu_categories: item.menu_categories_cloud ? { name: item.menu_categories_cloud.name } : undefined
  })) as MenuItem[];
}

export async function fetchCategories(slug: string) {
  const restaurantId = await getRestaurantId(slug);
  const { data, error } = await supabase
    .from('menu_categories_cloud')
    .select('name')
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true });
    
  if (error) throw new Error('Failed to fetch categories');
  return data.map(c => c.name);
}

export async function submitOrder(slug: string, tableId: string, items: any[], total: number, customerName?: string) {
  const restaurantId = await getRestaurantId(slug);
  
  const { data, error } = await supabase
    .from('qr_orders_queue')
    .insert({
      restaurant_id: restaurantId,
      table_number: parseInt(tableId, 10) || 0,
      table_label: `Table ${tableId}`,
      items: items.map(i => ({ menu_item_id: i.id, name: i.name, quantity: i.quantity, unit_price: i.price })),
      subtotal: total,
      customer_name: customerName,
      status: 'pending'
    })
    .select('id')
    .single();
    
  if (error) throw new Error('Failed to submit order');
  return { success: true, order_id: data.id };
}

export async function pollOrderStatus(orderId: string) {
  const { data, error } = await supabase
    .from('qr_orders_queue')
    .select('status')
    .eq('id', orderId)
    .single();
    
  if (error) throw new Error('Failed to fetch status');
  
  // Map Supabase status ('pending', 'approved', 'rejected') to local expected
  let localStatus = 'PENDING_APPROVAL';
  let message = 'Waiting for cashier approval...';
  
  if (data.status === 'approved') {
    localStatus = 'ACTIVE';
    message = 'Order approved! Kitchen is preparing...';
  } else if (data.status === 'rejected') {
    localStatus = 'CANCELLED';
    message = 'Order cancelled by restaurant.';
  }
  
  return { status: localStatus, message };
}
