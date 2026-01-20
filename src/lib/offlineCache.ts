// ==========================================
// OFFLINE CACHE UTILITY (POLISHED VERSION)
// ==========================================
// Location: src/shared/lib/offlineCache.ts
// Changes: Added TTL, cleanup, and expiration handling

import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface CacheEntry<T> {
  value: T;
  expires: number;
}

interface CacheDB extends DBSchema {
  configs: {
    key: string;
    value: CacheEntry<any>;
  };
  orders: {
    key: string;
    value: CacheEntry<any>;
  };
}

const DB_NAME = 'FireflowCache';
const DB_VERSION = 1;
const DEFAULT_TTL_DAYS = 7;

let dbInstance: IDBPDatabase<CacheDB> | null = null;

/**
 * Initialize and get database instance
 */
async function getDB(): Promise<IDBPDatabase<CacheDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<CacheDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Create object stores if they don't exist
      if (!db.objectStoreNames.contains('configs')) {
        db.createObjectStore('configs');
      }
      if (!db.objectStoreNames.contains('orders')) {
        db.createObjectStore('orders');
      }
    },
  });

  return dbInstance;
}

/**
 * Save data to cache with TTL
 * @param ttlDays Time to live in days (default: 7)
 */
export async function cacheSet<T>(
  store: 'configs' | 'orders',
  key: string,
  value: T,
  ttlDays: number = DEFAULT_TTL_DAYS
): Promise<void> {
  try {
    const db = await getDB();
    const entry: CacheEntry<T> = {
      value,
      expires: Date.now() + ttlDays * 24 * 60 * 60 * 1000
    };
    await db.put(store, entry, key);
  } catch (error) {
    console.error(`Failed to cache ${store}/${key}:`, error);
  }
}

/**
 * Get data from cache (checks expiration)
 * Returns undefined if expired or not found
 */
export async function cacheGet<T>(
  store: 'configs' | 'orders',
  key: string
): Promise<T | undefined> {
  try {
    const db = await getDB();
    const entry = await db.get(store, key) as CacheEntry<T> | undefined;

    if (!entry) return undefined;

    // Check if expired
    if (Date.now() > entry.expires) {
      // Auto-cleanup expired entry
      await db.delete(store, key);
      return undefined;
    }

    return entry.value;
  } catch (error) {
    console.error(`Failed to read cache ${store}/${key}:`, error);
    return undefined;
  }
}

/**
 * Delete data from cache
 */
export async function cacheDelete(
  store: 'configs' | 'orders',
  key: string
): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(store, key);
  } catch (error) {
    console.error(`Failed to delete cache ${store}/${key}:`, error);
  }
}

/**
 * Clear all data from a store
 */
export async function cacheClear(store: 'configs' | 'orders'): Promise<void> {
  try {
    const db = await getDB();
    await db.clear(store);
  } catch (error) {
    console.error(`Failed to clear cache ${store}:`, error);
  }
}

/**
 * Cleanup expired entries from cache
 * Should be called periodically (e.g., on app load)
 */
export async function cleanupExpiredCache(): Promise<number> {
  try {
    const db = await getDB();
    let deletedCount = 0;

    // Cleanup configs store
    const configTx = db.transaction('configs', 'readwrite');
    const configStore = configTx.objectStore('configs');
    const configKeys = await configStore.getAllKeys();

    for (const key of configKeys) {
      const entry = await configStore.get(key) as CacheEntry<any> | undefined;
      if (entry && Date.now() > entry.expires) {
        await configStore.delete(key);
        deletedCount++;
      }
    }

    await configTx.done;

    // Cleanup orders store
    const orderTx = db.transaction('orders', 'readwrite');
    const orderStore = orderTx.objectStore('orders');
    const orderKeys = await orderStore.getAllKeys();

    for (const key of orderKeys) {
      const entry = await orderStore.get(key) as CacheEntry<any> | undefined;
      if (entry && Date.now() > entry.expires) {
        await orderStore.delete(key);
        deletedCount++;
      }
    }

    await orderTx.done;

    console.log(`Cleaned up ${deletedCount} expired cache entries`);
    return deletedCount;
  } catch (error) {
    console.error('Failed to cleanup cache:', error);
    return 0;
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  configsCount: number;
  ordersCount: number;
  totalSize: number;
}> {
  try {
    const db = await getDB();
    
    const configKeys = await db.getAllKeys('configs');
    const orderKeys = await db.getAllKeys('orders');

    // Estimate size (rough approximation)
    const configsSize = await db.getAll('configs');
    const ordersSize = await db.getAll('orders');
    const totalSize = JSON.stringify([...configsSize, ...ordersSize]).length;

    return {
      configsCount: configKeys.length,
      ordersCount: orderKeys.length,
      totalSize
    };
  } catch (error) {
    console.error('Failed to get cache stats:', error);
    return { configsCount: 0, ordersCount: 0, totalSize: 0 };
  }
}

/**
 * Check if browser is online
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Create cache key for operations config
 */
export function getOperationsConfigKey(restaurantId: string): string {
  return `operations_${restaurantId}`;
}

/**
 * Initialize cache cleanup on app load
 * Call this once when app starts
 */
export async function initializeCache(): Promise<void> {
  try {
    await cleanupExpiredCache();
  } catch (error) {
    console.error('Failed to initialize cache:', error);
  }
}