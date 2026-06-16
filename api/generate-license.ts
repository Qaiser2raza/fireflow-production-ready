import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { plan, restaurant_id, restaurant_name, hardware_fingerprint } = req.body;

        if (!plan) {
            return res.status(400).json({ error: 'Plan is required' });
        }

        const privateKey = process.env.SAAS_PRIVATE_KEY_PEM;
        if (!privateKey) {
            return res.status(500).json({ error: 'SaaS Private Key is not configured' });
        }

        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            return res.status(500).json({ error: 'Supabase credentials not configured' });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        const issued_at = new Date().toISOString();
        const expires_at = new Date();
        expires_at.setFullYear(expires_at.getFullYear() + 1);

        const finalRestaurantId = restaurant_id || `TEMP-${Date.now()}`;
        
        const payload = {
            restaurant_id: finalRestaurantId,
            restaurant_name: restaurant_name || 'New Partner',
            plan,
            subscription_expires_at: expires_at.toISOString(),
            grace_period_days: 7,
            hardware_fingerprint: hardware_fingerprint || '',
            issued_at
        };

        const headerB64 = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url');
        const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

        const signer = crypto.createSign('SHA256');
        signer.update(`${headerB64}.${payloadB64}`);
        const signatureB64 = signer.sign(privateKey, 'base64url');

        const licenseKey = `${headerB64}.${payloadB64}.${signatureB64}`;

        const { data, error } = await supabase
            .from('license_keys')
            .insert({
                key: licenseKey,
                plan,
                status: 'unused',
                restaurant_id: finalRestaurantId,
                created_at: issued_at
            })
            .select('id, key')
            .single();

        if (error) {
            throw new Error(`Failed to save license to database: ${error.message}`);
        }

        res.status(200).json({ id: data.id, key: licenseKey });
    } catch (e: any) {
        console.error('License generation error:', e);
        res.status(500).json({ error: e.message });
    }
}
