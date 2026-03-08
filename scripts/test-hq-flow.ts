import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const hqClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runHQTest() {
    console.log("🔥 [HQ Simulation] Starting SaaS Deployment Test...");

    // 1. Login with Super Admin credentials
    console.log("\n[1] Logging into HQ as Super Admin...");
    const { data: authData, error: authError } = await hqClient.auth.signInWithPassword({
        email: 'qaisar.gr@gmail.com',
        password: 'Diljan@750'
    });

    if (authError) {
        console.error("❌ Login Failed:", authError.message);
        process.exit(1);
    }
    console.log("✅ Super Admin Login Successful!");

    // 2. Mint a new license key via Supabase function call
    console.log("\n[2] Minting a new PREMIUM License Key...");

    // Since we are creating a license directly with the service role (the app does this via hqApi which uses RPC or direct DB interaction)
    // Our hqApi uses a direct insert if we bypass RLS, or an RPC. Let's just insert with service key.
    const serviceClient = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    // Generate random 16-char key matching FIRE-XXXX-XXXX-XXXX
    const SAFE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const block = () => Array.from({ length: 4 }, () => SAFE_CHARS.charAt(Math.floor(Math.random() * SAFE_CHARS.length))).join('');
    const formattedKeyPrefix = `FIRE-${block()}-${block()}-${block()}`;

    const { data: license, error: licenseError } = await serviceClient
        .from('license_keys')
        .insert([
            { key: formattedKeyPrefix, plan: 'PREMIUM', status: 'unused' }
        ])
        .select()
        .single();

    if (licenseError) {
        console.error("❌ Failed to mint license:", licenseError.message);
        process.exit(1);
    }

    console.log(`✅ Minted License Key: ${license.key}`);

    // 3. Inform user to copy-paste this into the terminal to run activation
    console.log("\n==============================================");
    console.log("   SaaS End-To-End Testing Guide");
    console.log("==============================================");
    console.log("1. Use the following key in the POS Installer:");
    console.log(`   LICENSE KEY: ${license.key}`);
    console.log("");
    console.log("2. To test the POS Activation screen locally:");
    console.log("   Run: npm run dev");
    console.log("   Since .env already has dev credentials, temporarily comment out:");
    console.log("   # RESTAURANT_ID=...");
    console.log("   # LICENSE_KEY=...");
    console.log("   in your .env file to see the Activation Setup Wizard!");
    console.log("==============================================");

    process.exit(0);
}

runHQTest();
