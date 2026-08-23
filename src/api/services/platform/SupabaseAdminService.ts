// src/api/services/platform/SupabaseAdminService.ts
// Phase 1 slice B: production implementation of the owner-invite and
// cloud-registration ports. Every call resolves to a CLASSIFIED OUTCOME —
// never a thrown raw provider error — so the dispatcher can only ever
// transition on known results. Timeouts resolve to UNKNOWN (never failure).
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../../config/env';

export const PROVIDER_TIMEOUT_MS = 10000;

export type InviteOutcome =
  | { outcome: 'SENT'; userId: string }
  | { outcome: 'ALREADY_PRESENT'; userId?: string }
  | { outcome: 'RETRYABLE'; code: 'SUPABASE_5XX' | 'SUPABASE_RATE_LIMITED' }
  | { outcome: 'UNKNOWN'; code: 'SUPABASE_TIMEOUT' | 'SUPABASE_NETWORK' };

export type LookupOutcome =
  | { outcome: 'FOUND'; userId: string }
  | { outcome: 'NOT_FOUND' }
  | { outcome: 'UNKNOWN'; code: 'SUPABASE_TIMEOUT' | 'SUPABASE_NETWORK' | 'SUPABASE_5XX' };

export type CloudRegisterOutcome =
  | { outcome: 'REGISTERED' }
  | { outcome: 'ALREADY_PRESENT' }
  | { outcome: 'RETRYABLE'; code: string }
  | { outcome: 'UNKNOWN'; code: string };

export interface SupabaseInvitePort {
  findUserIdByEmail(email: string): Promise<LookupOutcome>;
  createUser(email: string, meta: { restaurant_id: string; invite_id: string; owner_name?: string; restaurant_name?: string }): Promise<InviteOutcome>;
}

export interface CloudRegisterPort {
  findCloudRestaurant(restaurantId: string): Promise<{ found: boolean } | { found: false; unknown: true }>;
  createCloudRestaurant(payload: {
    restaurant_id: string; name: string; slug: string;
    phone?: string | null; city?: string | null; subscription_plan: string;
  }): Promise<CloudRegisterOutcome>;
}

type UnknownOutcome = { outcome: 'UNKNOWN'; code: 'SUPABASE_TIMEOUT' | 'SUPABASE_NETWORK' };

function isUnknown(x: any): x is UnknownOutcome {
  return !!x && typeof x === 'object' && x.outcome === 'UNKNOWN';
}

/**
 * Race a provider call against the timeout clock. The loser of the race is
 * always an UNKNOWN classification — a timeout or dropped connection must
 * never be interpreted as definitive success or failure.
 */
async function raced<T>(op: () => PromiseLike<T>): Promise<T | UnknownOutcome> {
  const timer = new Promise<UnknownOutcome>(resolve => {
    setTimeout(() => resolve({ outcome: 'UNKNOWN', code: 'SUPABASE_TIMEOUT' }), PROVIDER_TIMEOUT_MS);
  });
  try {
    return await Promise.race([Promise.resolve(op()), timer]);
  } catch (e: any) {
    console.error('[SUPABASE ADMIN] provider call failed:', e?.message || e);
    return { outcome: 'UNKNOWN', code: 'SUPABASE_NETWORK' };
  }
}

let client: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient | null {
  if (client) return client;
  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_KEY) return null;
  client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  return client;
}

function classifyHttpError(status: number | undefined): 'SUPABASE_5XX' | 'SUPABASE_RATE_LIMITED' {
  if (status === 429) return 'SUPABASE_RATE_LIMITED';
  return 'SUPABASE_5XX';
}

export class SupabaseAdminService implements SupabaseInvitePort, CloudRegisterPort {
  isConfigured(): boolean {
    return !!(config.SUPABASE_URL && config.SUPABASE_SERVICE_KEY);
  }

  async findUserIdByEmail(email: string): Promise<LookupOutcome> {
    const c = getServiceClient();
    if (!c) return { outcome: 'UNKNOWN', code: 'SUPABASE_NETWORK' };
    // Pilot-scale reconciliation scan (bounded). HQ-API phase replaces this
    // with a dedicated lookup endpoint if the fleet grows.
    for (let page = 1; page <= 2; page++) {
      const res: any = await raced(() => c.auth.admin.listUsers({ page, perPage: 200 }));
      if (isUnknown(res)) return res;
      if (res?.error) return { outcome: 'UNKNOWN', code: 'SUPABASE_5XX' };
      const users: any[] = res?.data?.users || [];
      const hit = users.find((u: any) => String(u.email || '').toLowerCase() === email.toLowerCase());
      if (hit) return { outcome: 'FOUND', userId: hit.id };
      if (users.length < 200) break;
    }
    return { outcome: 'NOT_FOUND' };
  }

  async createUser(email: string, meta: { restaurant_id: string; invite_id: string; owner_name?: string; restaurant_name?: string }): Promise<InviteOutcome> {
    const c = getServiceClient();
    if (!c) return { outcome: 'UNKNOWN', code: 'SUPABASE_NETWORK' };

    const res: any = await raced(() => c.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: {
        restaurant_id: meta.restaurant_id,
        invite_id: meta.invite_id,
        role: 'RESTAURANT_OWNER',
        ...(meta.owner_name ? { name: meta.owner_name } : {}),
        ...(meta.restaurant_name ? { restaurant_name: meta.restaurant_name } : {}),
      },
    }));
    if (isUnknown(res)) return res;

    if (res?.error) {
      const msg = String(res.error.message || '').toLowerCase();
      const status = res.error.status;
      if (status === 422 || msg.includes('already') || msg.includes('duplicate')) {
        return { outcome: 'ALREADY_PRESENT' };
      }
      return { outcome: 'RETRYABLE', code: classifyHttpError(status) };
    }

    const userId = res?.data?.user?.id;
    if (!userId) return { outcome: 'UNKNOWN', code: 'SUPABASE_NETWORK' };
    return { outcome: 'SENT', userId };
  }

  async findCloudRestaurant(restaurantId: string): Promise<{ found: boolean } | { found: false; unknown: true }> {
    const c = getServiceClient();
    if (!c) return { found: false, unknown: true };
    const res: any = await raced(() =>
      c.from('restaurants_cloud').select('id').eq('restaurant_id', restaurantId).maybeSingle()
    );
    if (isUnknown(res)) return { found: false, unknown: true };
    if (res?.error) return { found: false, unknown: true };
    return { found: !!res?.data };
  }

  async createCloudRestaurant(payload: {
    restaurant_id: string; name: string; slug: string;
    phone?: string | null; city?: string | null; subscription_plan: string;
  }): Promise<CloudRegisterOutcome> {
    const c = getServiceClient();
    if (!c) return { outcome: 'UNKNOWN', code: 'SUPABASE_NETWORK' };

    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const res: any = await raced(() =>
      c.from('restaurants_cloud').insert({
        restaurant_id: payload.restaurant_id,
        name: payload.name,
        slug: payload.slug,
        phone: payload.phone ?? null,
        city: payload.city ?? null,
        subscription_plan: payload.subscription_plan,
        subscription_status: 'trial',
        trial_ends_at: trialEndsAt,
        subscription_expires_at: null,
        currency: 'PKR',
      })
    );
    if (isUnknown(res)) return res;

    if (res?.error) {
      const msg = String(res.error.message || '').toLowerCase();
      const code = String(res.error.code || '');
      if (code === '23505' || msg.includes('duplicate') || msg.includes('already')) {
        return { outcome: 'ALREADY_PRESENT' };
      }
      return { outcome: 'RETRYABLE', code: classifyHttpError(res.error.status) };
    }
    return { outcome: 'REGISTERED' };
  }
}

export const supabaseAdminService = new SupabaseAdminService();
