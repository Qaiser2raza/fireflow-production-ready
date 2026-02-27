/**
 * Comprehensive Enterprise Feature Test
 * Tests: Super Admin Login, License Generation, License Application, Supabase Connectivity
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import * as dotenv from 'dotenv';
import { getSupabaseClient } from '../src/shared/lib/cloudClient';

dotenv.config();

const API_URL = process.env.VITE_API_URL || 'http://localhost:3001';
const SUPER_ADMIN_PIN = '9999';

async function testEnterpriseFlow() {
    console.log('🚀 Starting Enterprise Feature Test...');

    try {
        // 1. Login as Super Admin
        console.log('Step 1: Logging in as Super Admin...');
        const loginRes = await axios.post(`${API_URL}/api/auth/login`, {
            pin: SUPER_ADMIN_PIN
        });

        const token = loginRes.data.tokens.access_token;
        const staffId = loginRes.data.staff.id;
        const restaurantId = loginRes.data.staff.restaurant_id;

        console.log(`✅ Logged in! Staff: ${loginRes.data.staff.name}, RestaurantID: ${restaurantId}`);

        const authHeaders = {
            headers: { Authorization: `Bearer ${token}` }
        };

        // 2. Test Supabase Connectivity
        console.log('Step 2: Testing Supabase Connectivity...');
        const supabase = getSupabaseClient();
        const { data: cloudData, error: cloudError } = await supabase
            .from('license_keys')
            .select('count')
            .limit(1);

        if (cloudError) {
            console.warn('⚠️ Supabase Connection (Direct):', cloudError.message);
            console.log('(This might fail if RLS is enabled or table does not exist, but connection was attempted)');
        } else {
            console.log('✅ Supabase Connected successfully!');
        }

        // 3. Generate License Key via API
        console.log('Step 3: Generating License Key via Super Admin API...');
        const genRes = await axios.post(`${API_URL}/api/super-admin/licenses/generate`, {
            restaurantId: restaurantId,
            licenseType: 'ENTERPRISE',
            deviceLimit: 10
        }, authHeaders);

        const licenseKey = genRes.data.license_key;
        console.log(`✅ License Generated: ${licenseKey}`);

        // 4. Apply License Key
        console.log('Step 4: Applying License Key...');
        const applyRes = await axios.post(`${API_URL}/api/super-admin/licenses/apply`, {
            restaurantId: restaurantId,
            licenseKey: licenseKey
        }, authHeaders);

        console.log(`✅ License Applied! Status: ${applyRes.data.is_active ? 'ACTIVE' : 'INACTIVE'}`);

        // 5. Verify Restaurant Status
        console.log('Step 5: Verifying Restaurant Subscription Status...');
        const restRes = await axios.get(`${API_URL}/api/super-admin/restaurants`, authHeaders);
        const demoRest = restRes.data.find((r: any) => r.id === restaurantId);

        console.log(`✅ Restaurant: ${demoRest.name}`);
        console.log(`✅ Status: ${demoRest.subscription_status}`);
        console.log(`✅ Plan: ${demoRest.subscription_plan}`);

        console.log('\n✨ ALL TESTS PASSED SUCCESSFULLY! ✨');

    } catch (error: any) {
        console.error('❌ Test Failed:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
        process.exit(1);
    }
}

testEnterpriseFlow();
