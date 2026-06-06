import { openDB, type DBSchema } from 'idb';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface RestaurantCartDB extends DBSchema {
  carts: {
    key: string;
    value: {
      tableId: string;
      items: CartItem[];
      updatedAt: number;
    };
  };
}

const dbPromise = openDB<RestaurantCartDB>('RestaurantCartDB', 1, {
  upgrade(db) {
    db.createObjectStore('carts', { keyPath: 'tableId' });
  },
});

export async function getCart(tableId: string) {
  const db = await dbPromise;
  const cart = await db.get('carts', tableId);
  return cart?.items || [];
}

export async function addToCart(tableId: string, item: Omit<CartItem, 'quantity'>, quantity: number) {
  const db = await dbPromise;
  const cart = await db.get('carts', tableId);
  const items = cart?.items || [];
  
  const existingItemIndex = items.findIndex((i) => i.id === item.id);
  if (existingItemIndex > -1) {
    items[existingItemIndex].quantity += quantity;
  } else {
    items.push({ ...item, quantity });
  }

  await db.put('carts', {
    tableId,
    items,
    updatedAt: Date.now(),
  });
  
  return items;
}

export async function updateQuantity(tableId: string, itemId: string, quantity: number) {
  const db = await dbPromise;
  const cart = await db.get('carts', tableId);
  if (!cart) return [];

  let items = cart.items;
  if (quantity <= 0) {
    items = items.filter((i) => i.id !== itemId);
  } else {
    const item = items.find((i) => i.id === itemId);
    if (item) item.quantity = quantity;
  }

  await db.put('carts', {
    tableId,
    items,
    updatedAt: Date.now(),
  });
  
  return items;
}

export async function clearCart(tableId: string) {
  const db = await dbPromise;
  await db.delete('carts', tableId);
}
