/**
 * Supabase Cloud Client for SaaS Management
 * 
 * IMPORTANT: This client is ONLY for SaaS operations (licensing, subscriptions, payments)
 * Operational data (orders, staff, tables, etc.) stays in local PostgreSQL
 * 
 * This is completely separate from the local database (db.ts)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../config/env';

// ==========================================
// TYPES
// ==========================================

export interface RestaurantRegistrationData {
  restaurantId: string;
  name: string;
  phone: string;
  city: string;
  slug: string;
  subscriptionPlan: 'BASIC' | 'STANDARD' | 'PREMIUM';
}

export interface LicenseKeyResponse {
  data: {
    id: string;
    key: string;
    plan: 'BASIC' | 'STANDARD' | 'PREMIUM';
    status: 'unused' | 'active' | 'revoked';
  } | null;
  error: string | null;
}

export interface ActivateLicenseResponse {
  data: {
    id: string;
    key: string;
    restaurant_id: string;
    activated_at: string;
  } | null;
  error: string | null;
}

export interface RegisterRestaurantResponse {
  data: {
    id: string;
    restaurant_id: string;
    name: string;
    subscription_status: 'trial' | 'active' | 'expired';
    trial_ends_at: string;
  } | null;
  error: string | null;
}

export interface SubscriptionStatusResponse {
  data: {
    status: 'trial' | 'active' | 'expired';
    plan: 'BASIC' | 'STANDARD' | 'PREMIUM';
    expiryDate: string | null;
    monthlyFee: number;
    currency: string;
    trialEndsAt: string | null;
  } | null;
  error: string | null;
}

export interface PaymentProofResponse {
  data: {
    id: string;
    restaurant_id: string;
    amount: number;
    status: 'pending' | 'verified' | 'rejected';
    created_at: string;
  } | null;
  error: string | null;
}

export interface LicenseKey {
  id: string;
  key: string;
  plan: 'BASIC' | 'STANDARD' | 'PREMIUM';
  status: 'unused' | 'active' | 'revoked';
  restaurant_id: string | null;
  restaurant_name: string | null;
  created_at: string;
  activated_at: string | null;
}

// ==========================================
// CLOUD CLIENT INITIALIZATION
// ==========================================

let supabaseClient: SupabaseClient | null | undefined = undefined;

/**
 * Create a mock Supabase client for development mode
 * Returns error responses for all operations
 */
function createMockClient(): any {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: () => ({
            single: async () => ({
              data: null,
              error: { message: 'Cloud services disabled (development mode)' }
            })
          }),
          async execute() {
            return {
              data: [],
              error: { message: 'Cloud services disabled' }
            };
          }
        }),
        limit: () => ({
          async execute() {
            return {
              data: [],
              error: { message: 'Cloud services disabled' }
            };
          }
        }),
        async execute() {
          return {
            data: [],
            error: { message: 'Cloud services disabled' }
          };
        }
      }),
      insert: () => ({
        select: () => ({
          async single() {
            return {
              data: null,
              error: { message: 'Cloud services disabled' }
            };
          }
        }),
        async execute() {
          return {
            data: null,
            error: { message: 'Cloud services disabled' }
          };
        }
      }),
      update: () => ({
        eq: () => ({
          async execute() {
            return {
              data: null,
              error: { message: 'Cloud services disabled' }
            };
          }
        })
      })
    }),
    rpc: async () => ({
      data: null,
      error: { message: 'Cloud services disabled' }
    })
  };
}

/**
 * Initialize Supabase cloud client
 * Called once on app startup
 * Returns mock if not configured (development mode)
 */
function initializeCloudClient(): SupabaseClient {
  if (supabaseClient !== undefined && supabaseClient !== null) {
    return supabaseClient;
  }

  const supabaseUrl = config.VITE_SUPABASE_URL || config.SUPABASE_URL;

  // On the server, we prefer SERVICE_KEY to bypass RLS for admin tasks
  // On the client, we MUST use ANON_KEY
  const isServer = typeof window === 'undefined';
  const supabaseKey = (isServer && config.SUPABASE_SERVICE_KEY)
    ? config.SUPABASE_SERVICE_KEY
    : (config.VITE_SUPABASE_ANON_KEY || config.SUPABASE_ANON_KEY);

  if (!supabaseUrl || !supabaseKey) {
    console.log('[CLOUD] Supabase not configured - using mock client (development mode)');
    supabaseClient = createMockClient() as any;
    return supabaseClient as SupabaseClient;
  }

  supabaseClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false
    }
  });

  console.log('[CLOUD] Supabase client initialized');
  return supabaseClient;
}

/**
 * Get initialized Supabase client
 * Returns mock client if not configured
 */
function getCloudClient(): SupabaseClient {
  return initializeCloudClient();
}

// ==========================================
// LICENSE KEY OPERATIONS
// ==========================================

/**
 * Check if a license key is valid and unused
 * 
 * @param key - License key to validate (e.g., "FIREFLOW-ABC123-XYZ789")
 * @returns License key details if valid and unused
 */
export async function checkLicenseKey(key: string): Promise<LicenseKeyResponse> {
  try {
    const client = getCloudClient();

    const { data, error } = await client
      .from('license_keys')
      .select('id, key, plan, status')
      .eq('key', key.toUpperCase())
      .single();

    if (error) {
      return {
        data: null,
        error: error?.message || 'License key not found'
      };
    }

    if (data.status !== 'unused') {
      return {
        data: null,
        error: `License key is already ${data.status}`
      };
    }

    return {
      data: {
        id: data.id,
        key: data.key,
        plan: data.plan,
        status: data.status
      },
      error: null
    };
  } catch (error: any) {
    console.error('[CLOUD] checkLicenseKey error:', error.message);
    return {
      data: null,
      error: 'Failed to validate license key'
    };
  }
}

/**
 * Activate a license key for a specific restaurant
 * 
 * @param key - License key to activate
 * @param restaurantId - Local restaurant UUID to link with
 * @returns Activation details
 */
export async function activateLicenseKey(
  key: string,
  restaurantId: string
): Promise<ActivateLicenseResponse> {
  try {
    const client = getCloudClient();

    // First verify key exists and is unused
    const checkResponse = await checkLicenseKey(key);
    if (checkResponse.error || !checkResponse.data) {
      return {
        data: null,
        error: checkResponse.error || 'License key validation failed'
      };
    }

    // Update license key status
    const { data, error } = await client
      .from('license_keys')
      .update({
        status: 'active',
        restaurant_id: restaurantId,
        activated_at: new Date().toISOString()
      })
      .eq('key', key.toUpperCase())
      .select('id, key, restaurant_id, activated_at')
      .single();

    if (error) {
      return {
        data: null,
        error: 'Failed to activate license key'
      };
    }

    console.log(`[CLOUD] License key activated for restaurant ${restaurantId}`);

    return {
      data: {
        id: data.id,
        key: data.key,
        restaurant_id: data.restaurant_id,
        activated_at: data.activated_at
      },
      error: null
    };
  } catch (error: any) {
    console.error('[CLOUD] activateLicenseKey error:', error.message);
    return {
      data: null,
      error: 'Failed to activate license key'
    };
  }
}

// ==========================================
// RESTAURANT REGISTRATION
// ==========================================

/**
 * Register a new restaurant in the cloud SaaS system
 * Creates a cloud record linked to local restaurant
 * 
 * @param data - Restaurant registration details
 * @returns Cloud restaurant record
 */
export async function registerRestaurant(
  data: RestaurantRegistrationData
): Promise<RegisterRestaurantResponse> {
  try {
    const client = getCloudClient();

    // Trial period: 30 days from now
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 30);

    const { data: restaurant, error } = await client
      .from('restaurants_cloud')
      .insert({
        restaurant_id: data.restaurantId,
        name: data.name,
        phone: data.phone,
        city: data.city,
        slug: data.slug,
        subscription_plan: data.subscriptionPlan,
        subscription_status: 'trial',
        trial_ends_at: trialEndsAt.toISOString(),
        subscription_expires_at: null,
        monthly_fee: getMonthlyFeeForPlan(data.subscriptionPlan),
        currency: 'PKR',
        created_at: new Date().toISOString()
      })
      .select('id, restaurant_id, name, subscription_status, trial_ends_at')
      .single();

    if (error) {
      return {
        data: null,
        error: 'Failed to register restaurant in cloud system'
      };
    }

    console.log(`[CLOUD] Restaurant registered: ${data.restaurantId}`);

    return {
      data: {
        id: restaurant.id,
        restaurant_id: restaurant.restaurant_id,
        name: restaurant.name,
        subscription_status: restaurant.subscription_status,
        trial_ends_at: restaurant.trial_ends_at
      },
      error: null
    };
  } catch (error: any) {
    console.error('[CLOUD] registerRestaurant error:', error.message);
    return {
      data: null,
      error: 'Failed to register restaurant'
    };
  }
}

// ==========================================
// SUBSCRIPTION MANAGEMENT
// ==========================================

/**
 * Get subscription status for a restaurant
 * 
 * @param restaurantId - Restaurant UUID
 * @returns Subscription status and expiry information
 */
export async function getSubscriptionStatus(
  restaurantId: string
): Promise<SubscriptionStatusResponse> {
  try {
    const client = getCloudClient();

    const { data, error } = await client
      .from('restaurants_cloud')
      .select(
        'subscription_status, subscription_plan, subscription_expires_at, monthly_fee, currency, trial_ends_at'
      )
      .eq('restaurant_id', restaurantId)
      .single();

    if (error) {
      return {
        data: null,
        error: 'Restaurant subscription not found'
      };
    }

    // Determine actual status based on dates
    let actualStatus: 'trial' | 'active' | 'expired' = data.subscription_status;
    let expiryDate: string | null = null;

    if (data.subscription_status === 'trial') {
      const trialEnds = new Date(data.trial_ends_at);
      if (trialEnds < new Date()) {
        actualStatus = 'expired';
        expiryDate = data.trial_ends_at;
      }
    } else if (data.subscription_status === 'active') {
      const expiresAt = new Date(data.subscription_expires_at);
      if (expiresAt < new Date()) {
        actualStatus = 'expired';
      }
      expiryDate = data.subscription_expires_at;
    }

    return {
      data: {
        status: actualStatus,
        plan: data.subscription_plan,
        expiryDate: expiryDate,
        monthlyFee: data.monthly_fee,
        currency: data.currency,
        trialEndsAt: data.trial_ends_at
      },
      error: null
    };
  } catch (error: any) {
    console.error('[CLOUD] getSubscriptionStatus error:', error.message);
    return {
      data: null,
      error: 'Failed to fetch subscription status'
    };
  }
}

// ==========================================
// PAYMENT OPERATIONS
// ==========================================

/**
 * Submit payment proof for subscription activation
 * Creates a pending payment record for manual verification
 * 
 * @param restaurantId - Restaurant UUID
 * @param proofUrl - URL to payment proof image/document (uploaded to cloud storage)
 * @param amount - Payment amount in PKR
 * @returns Payment record
 */
export async function submitPaymentProof(
  restaurantId: string,
  proofUrl: string,
  amount: number
): Promise<PaymentProofResponse> {
  try {
    if (!proofUrl || !restaurantId || amount <= 0) {
      return {
        data: null,
        error: 'Invalid payment details'
      };
    }

    const client = getCloudClient();

    const { data, error } = await client
      .from('subscription_payments')
      .insert({
        restaurant_id: restaurantId,
        amount: amount,
        payment_method: 'BANK_TRANSFER',
        payment_proof_url: proofUrl,
        status: 'pending',
        notes: `Payment proof submitted for manual verification`,
        created_at: new Date().toISOString()
      })
      .select('id, restaurant_id, amount, status, created_at')
      .single();

    if (error) {
      return {
        data: null,
        error: 'Failed to submit payment proof'
      };
    }

    console.log(`[CLOUD] Payment proof submitted for restaurant ${restaurantId}`);

    return {
      data: {
        id: data.id,
        restaurant_id: data.restaurant_id,
        amount: data.amount,
        status: data.status,
        created_at: data.created_at
      },
      error: null
    };
  } catch (error: any) {
    console.error('[CLOUD] submitPaymentProof error:', error.message);
    return {
      data: null,
      error: 'Failed to submit payment proof'
    };
  }
}

// ==========================================
// LICENSE KEY MANAGEMENT
// ==========================================

/**
 * Generate a new license key in format: FIRE-XXXX-XXXX-XXXX
 * Safe characters exclude: 0, O, 1, I (confusing)
 */
export async function generateLicenseKey(plan: 'BASIC' | 'STANDARD' | 'PREMIUM'): Promise<{ data: { key: string; id: string } | null; error: string | null }> {
  try {
    const SAFE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    const generateBlock = (): string => {
      let block = '';
      for (let i = 0; i < 4; i++) {
        block += SAFE_CHARS.charAt(Math.floor(Math.random() * SAFE_CHARS.length));
      }
      return block;
    };

    const key = `FIRE-${generateBlock()}-${generateBlock()}-${generateBlock()}`;

    const client = getCloudClient();

    const { data, error } = await client
      .from('license_keys')
      .insert({
        key: key,
        plan: plan,
        status: 'unused',
        created_at: new Date().toISOString()
      })
      .select('id, key')
      .single();

    if (error) {
      return {
        data: null,
        error: 'Failed to generate license key'
      };
    }

    console.log(`[CLOUD] Generated license key: ${key}`);

    return {
      data: {
        key: data.key,
        id: data.id
      },
      error: null
    };
  } catch (error: any) {
    console.error('[CLOUD] generateLicenseKey error:', error.message);
    return {
      data: null,
      error: 'Failed to generate license key'
    };
  }
}

/**
 * Get all license keys with restaurant names
 */
export async function getLicenseKeys(): Promise<{ data: LicenseKey[] | null; error: string | null }> {
  try {
    const client = getCloudClient();

    // 1. Fetch license keys first
    const { data: licenseData, error: licenseError } = await client
      .from('license_keys')
      .select('id, key, plan, status, restaurant_id, created_at, activated_at')
      .order('created_at', { ascending: false });

    if (licenseError) {
      console.error('[CLOUD] getLicenseKeys select error:', licenseError);
      return {
        data: null,
        error: `Failed to fetch license keys: ${licenseError.message}`
      };
    }

    if (!licenseData || licenseData.length === 0) {
      return { data: [], error: null };
    }

    // 2. Fetch unique restaurant IDs that are linked to keys
    const restaurantIds = [...new Set(licenseData
      .map((l: any) => l.restaurant_id)
      .filter((id: any) => !!id))];

    // 3. Create a map of restaurant IDs to names
    const restaurantMap: Record<string, string> = {};

    if (restaurantIds.length > 0) {
      const { data: restaurantData, error: restaurantError } = await client
        .from('restaurants_cloud')
        .select('restaurant_id, name')
        .in('restaurant_id', restaurantIds);

      if (restaurantError) {
        console.warn('[CLOUD] Could not fetch restaurant names for licenses:', restaurantError.message);
      } else if (restaurantData) {
        restaurantData.forEach((r: any) => {
          restaurantMap[r.restaurant_id] = r.name;
        });
      }
    }

    // 4. Format and return
    const formattedData: LicenseKey[] = licenseData.map((item: any) => ({
      id: item.id,
      key: item.key,
      plan: item.plan,
      status: item.status,
      restaurant_id: item.restaurant_id,
      restaurant_name: restaurantMap[item.restaurant_id] || null,
      created_at: item.created_at,
      activated_at: item.activated_at
    }));

    return {
      data: formattedData,
      error: null
    };
  } catch (error: any) {
    console.error('[CLOUD] getLicenseKeys fatal error:', error.message);
    return {
      data: null,
      error: 'Failed to fetch license keys'
    };
  }
}

/**
 * Revoke a license key
 */
export async function revokeLicenseKey(keyId: string): Promise<{ data: boolean | null; error: string | null }> {
  try {
    const client = getCloudClient();

    const { error } = await client
      .from('license_keys')
      .update({ status: 'revoked' })
      .eq('id', keyId);

    if (error) {
      return {
        data: null,
        error: 'Failed to revoke license key'
      };
    }

    console.log(`[CLOUD] Revoked license key: ${keyId}`);

    return {
      data: true,
      error: null
    };
  } catch (error: any) {
    console.error('[CLOUD] revokeLicenseKey error:', error.message);
    return {
      data: null,
      error: 'Failed to revoke license key'
    };
  }
}

/**
 * Get payment history for a restaurant
 */
export async function getPaymentHistory(restaurantId: string): Promise<{ data: any[] | null; error: string | null }> {
  try {
    const client = getCloudClient();

    const { data, error } = await client
      .from('subscription_payments')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      return {
        data: null,
        error: 'Failed to fetch payment history'
      };
    }

    return {
      data: data || [],
      error: null
    };
  } catch (error: any) {
    console.error('[CLOUD] getPaymentHistory error:', error.message);
    return {
      data: null,
      error: 'Failed to fetch payment history'
    };
  }
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Get monthly subscription fee based on plan
 */
function getMonthlyFeeForPlan(plan: 'BASIC' | 'STANDARD' | 'PREMIUM'): number {
  const fees: Record<string, number> = {
    BASIC: 4999,      // Rs. 4,999
    STANDARD: 9999,   // Rs. 9,999
    PREMIUM: 19999    // Rs. 19,999
  };
  return fees[plan] || 4999;
}

/**
 * Export for testing/debugging - get raw Supabase client
 */
export function getSupabaseClient(): SupabaseClient {
  return getCloudClient();
}
