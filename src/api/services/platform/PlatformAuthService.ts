// src/api/services/platform/PlatformAuthService.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../../config/env';

export interface PlatformUser {
  id: string;
  email: string;
  role: 'PLATFORM_OWNER' | 'SUPPORT_ENGINEER' | 'SUPPORT_AGENT';
  name?: string;
}

export interface PlatformAuthResult {
  valid: boolean;
  user?: PlatformUser;
  error?: string;
}

// Platform authority MUST come only from server-controlled Supabase app_metadata.
// user_metadata is user-modifiable and must never grant platform privileges.
export class PlatformAuthService {
  private supabase: SupabaseClient | null = null;

  constructor() {
    this.initializeClient();
  }

  private initializeClient() {
    const url = config.SUPABASE_URL;
    const key = config.SUPABASE_SERVICE_KEY;

    if (!url || !key) {
      console.error('[PLATFORM_AUTH] SUPABASE_URL and SUPABASE_SERVICE_KEY are required for platform authentication');
      return;
    }

    this.supabase = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    });
  }

  async verifyAccessToken(token: string): Promise<PlatformAuthResult> {
    if (!this.supabase) {
      return { valid: false, error: 'Platform authentication not configured' };
    }

    try {
      const { data, error } = await this.supabase.auth.getUser(token);

      if (error || !data.user) {
        return { valid: false, error: error?.message || 'Invalid platform token' };
      }

      const role = this.extractPlatformRole(data.user);

      if (!role) {
        return { valid: false, error: 'User does not have a platform role' };
      }

      return {
        valid: true,
        user: {
          id: data.user.id,
          email: data.user.email || '',
          role,
          name: data.user.user_metadata?.name || data.user.email || 'Platform User'
        }
      };
    } catch (err: any) {
      return { valid: false, error: err.message || 'Token verification failed' };
    }
  }

  private extractPlatformRole(user: any): PlatformUser['role'] | null {
    // Platform authority MUST come only from server-controlled app_metadata.
    // user_metadata is user-modifiable and must never grant platform privileges.
    const appMetadata = user.app_metadata || {};

    const roleSource = appMetadata.platform_role || appMetadata.role;

    if (roleSource === 'PLATFORM_OWNER' || roleSource === 'platform_owner') return 'PLATFORM_OWNER';
    if (roleSource === 'SUPPORT_ENGINEER' || roleSource === 'support_engineer') return 'SUPPORT_ENGINEER';
    if (roleSource === 'SUPPORT_AGENT' || roleSource === 'support_agent') return 'SUPPORT_AGENT';

    return null;
  }
}

export const platformAuthService = new PlatformAuthService();
