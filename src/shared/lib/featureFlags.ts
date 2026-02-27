/**
 * Feature Flags System
 * Controls feature availability globally and per-restaurant
 */

import { config } from '../../config/env';

export interface FeatureFlags {
    cloudSync: boolean;
    analytics: boolean;
    auditLogs: boolean;
    multiCurrency: boolean;
    inventory: boolean;
    employeeScheduling: boolean;
    catering: boolean;
    multiTenancy: boolean;
}

class FeatureFlagService {
    private flags: FeatureFlags;
    private restaurantOverrides: Map<string, Partial<FeatureFlags>> = new Map();

    constructor(baseFlags: FeatureFlags) {
        this.flags = baseFlags;
    }

    /**
     * Check if a feature is enabled for a specific restaurant (or globally if no ID provided)
     */
    isEnabled(restaurantId: string | null, feature: keyof FeatureFlags): boolean {
        // Check restaurant override first
        if (restaurantId && this.restaurantOverrides.has(restaurantId)) {
            const override = this.restaurantOverrides.get(restaurantId);
            if (override && override[feature] !== undefined) {
                return override[feature] as boolean;
            }
        }

        // Fall back to global flag
        return this.flags[feature];
    }

    /**
     * Set an override for a specific restaurant
     * In a production app, this would be fetched from a database
     */
    async setRestaurantOverride(
        restaurantId: string,
        overrides: Partial<FeatureFlags>
    ) {
        this.restaurantOverrides.set(restaurantId, overrides);

        // Persist to database if Supabase is available
        if (config.SUPABASE_URL && (config.SUPABASE_SERVICE_KEY || config.SUPABASE_ANON_KEY)) {
            try {
                const key = config.SUPABASE_SERVICE_KEY || config.SUPABASE_ANON_KEY;
                await fetch(`${config.SUPABASE_URL}/rest/v1/restaurant_features`, {
                    method: 'POST',
                    headers: {
                        'apikey': key!,
                        'Authorization': `Bearer ${key}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'resolution=merge-duplicates'
                    },
                    body: JSON.stringify({ restaurant_id: restaurantId, features: overrides })
                });
            } catch (err) {
                console.error('Failed to persist feature flag override:', err);
            }
        }
    }

    /**
     * Initialize overrides from database
     */
    async loadOverrides() {
        if (config.SUPABASE_URL && (config.SUPABASE_SERVICE_KEY || config.SUPABASE_ANON_KEY)) {
            try {
                const key = config.SUPABASE_SERVICE_KEY || config.SUPABASE_ANON_KEY;
                const response = await fetch(`${config.SUPABASE_URL}/rest/v1/restaurant_features`, {
                    headers: {
                        'apikey': key!,
                        'Authorization': `Bearer ${key}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    data.forEach((item: any) => {
                        this.restaurantOverrides.set(item.restaurant_id, item.features);
                    });
                }
            } catch (err) {
                console.warn('Failed to load feature flag overrides:', err);
            }
        }
    }
}

// Initialize with environment variables
export const features = new FeatureFlagService({
    cloudSync: config.ENABLE_CLOUD_SYNC === 'true',
    analytics: config.ENABLE_ANALYTICS === 'true',
    auditLogs: config.ENABLE_AUDIT_LOGS === 'true',
    multiCurrency: false,
    inventory: false,
    employeeScheduling: false,
    catering: false,
    multiTenancy: config.ENABLE_MULTI_TENANCY === 'true'
});

// Load overrides on startup
if (typeof window === 'undefined') {
    features.loadOverrides().catch(console.error);
}
