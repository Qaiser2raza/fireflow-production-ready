/**
 * HQ Cloud API
 * All data fetching for the HQ admin panel.
 * Calls Supabase DIRECTLY — no localhost:3001 needed.
 * Safe to use from Vercel (cloud-hosted).
 */

import { createClient } from '@supabase/supabase-js';

// Service role client — NEVER expose this to the restaurant POS frontend
// On Vercel this is set as an env var with restricted access
const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL!,
    import.meta.env.VITE_SUPABASE_ANON_KEY!
);

// ==========================================
// LICENSES
// ==========================================

export async function hqGetLicenses() {
    const { data, error } = await supabase
        .from('license_keys')
        .select('id, key, plan, status, restaurant_id, created_at, activated_at')
        .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    // Enrich with restaurant names from restaurants_cloud
    const restaurantIds = [...new Set((data || []).map((l: any) => l.restaurant_id).filter(Boolean))];
    let restaurantMap: Record<string, string> = {};

    if (restaurantIds.length > 0) {
        const { data: rData } = await supabase
            .from('restaurants_cloud')
            .select('restaurant_id, name')
            .in('restaurant_id', restaurantIds);

        (rData || []).forEach((r: any) => { restaurantMap[r.restaurant_id] = r.name; });
    }

    return (data || []).map((l: any) => ({
        id: l.id,
        key: l.key,
        plan: l.plan,
        status: l.status,
        restaurant_id: l.restaurant_id,
        restaurant_name: restaurantMap[l.restaurant_id] || null,
        created_at: l.created_at,
        activated_at: l.activated_at,
    }));
}

export async function hqGenerateLicense(data: { plan: string, restaurant_id?: string, restaurant_name?: string, hardware_fingerprint?: string }) {
    const response = await fetch('/api/generate-license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to generate license via HQ API');
    }
    
    return await response.json();
}

export async function hqAddRestaurant(data: any) {
    const { error, data: resData } = await supabase
        .from('restaurants_cloud')
        .insert(data)
        .select('restaurant_id')
        .single();
        
    if (error) throw new Error(error.message);
    return resData;
}

export async function hqRevokeLicense(id: string) {
    const { error } = await supabase
        .from('license_keys')
        .update({ status: 'revoked' })
        .eq('id', id);

    if (error) throw new Error(error.message);
}

// ==========================================
// RESTAURANTS
// ==========================================

export async function hqGetRestaurants() {
    const { data, error } = await supabase
        .from('restaurants_cloud')
        .select('restaurant_id, name, phone, city, subscription_status, subscription_plan, trial_ends_at, subscription_expires_at, monthly_fee, created_at')
        .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
}

// ==========================================
// PAYMENTS
// ==========================================

export async function hqGetPayments() {
    const { data, error } = await supabase
        .from('subscription_payments')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
}

export async function hqVerifyPayment(paymentId: string, status: 'verified' | 'rejected') {
    const { data: payment, error: fetchErr } = await supabase
        .from('subscription_payments')
        .select('restaurant_id, amount')
        .eq('id', paymentId)
        .single();

    if (fetchErr || !payment) throw new Error('Payment not found');

    const { error } = await supabase
        .from('subscription_payments')
        .update({ status, verified_at: new Date().toISOString() })
        .eq('id', paymentId);

    if (error) throw new Error(error.message);

    // If verified, activate the restaurant's subscription for 30 days
    if (status === 'verified') {
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        
        const { data: rest } = await supabase
            .from('restaurants_cloud')
            .select('subscription_plan, name')
            .eq('restaurant_id', payment.restaurant_id)
            .single();

        await supabase
            .from('restaurants_cloud')
            .update({
                subscription_status: 'active',
                subscription_expires_at: expiresAt,
            })
            .eq('restaurant_id', payment.restaurant_id);

        if (rest) {
            await fetch('/api/generate-license', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    plan: rest.subscription_plan, 
                    restaurant_id: payment.restaurant_id,
                    restaurant_name: rest.name
                })
            });
        }
    }
}

// ==========================================
// ANALYTICS OVERVIEW
// ==========================================

export async function hqGetOverview() {
    const [restaurants, licenses, payments] = await Promise.all([
        hqGetRestaurants(),
        hqGetLicenses(),
        hqGetPayments(),
    ]);

    const total = restaurants.length;
    const active = restaurants.filter((r: any) => r.subscription_status === 'active').length;
    const trial = restaurants.filter((r: any) => r.subscription_status === 'trial').length;
    const expired = restaurants.filter((r: any) => r.subscription_status === 'expired').length;
    const pendingPayments = payments.filter((p: any) => p.status === 'pending').length;
    const unusedLicenses = licenses.filter((l: any) => l.status === 'unused').length;

    return { total, active, trial, expired, pendingPayments, unusedLicenses, restaurants, licenses, payments };
}
