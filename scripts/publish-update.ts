import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

/**
 * FIREFLOW PUBLISHING SCRIPT
 * Run this on your development laptop to push updates to all restaurants.
 * 
 * Requirements in .env:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_KEY (Required for storage upload)
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ CONFIG ERROR: Supabase credentials missing in .env');
    console.log('Please ensure SUPABASE_URL and SUPABASE_SERVICE_KEY are set.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function publish() {
    try {
        console.log('\n========================================');
        console.log('🔥 FIREFLOW CLOUD PUBLISH ENGINE 🔥');
        console.log('========================================\n');

        // 1. Build project
        console.log('📦 STEP 1: Compiling application...');
        execSync('npm run build && npm run build:backend', { stdio: 'inherit' });

        // 2. Identify Version
        const pkgPath = path.resolve(process.cwd(), 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const version = pkg.version;
        const releaseName = `fireflow-update-v${version.replace(/\./g, '_')}.zip`;

        console.log(`\n🏷️  Detected Version: ${version}`);

        // 3. Package Files
        console.log('🤐 STEP 2: Creating update package...');
        const zip = new AdmZip();
        
        // Add core artifacts
        if (fs.existsSync('dist')) zip.addLocalFolder('dist', 'dist');
        if (fs.existsSync('server.cjs')) zip.addLocalFile('server.cjs');
        if (fs.existsSync('prisma')) zip.addLocalFolder('prisma', 'prisma');
        zip.addLocalFile('package.json');
        
        const releaseDir = path.join(process.cwd(), 'release');
        if (!fs.existsSync(releaseDir)) fs.mkdirSync(releaseDir);
        
        const zipPath = path.join(releaseDir, 'latest_update.zip');
        zip.writeZip(zipPath);
        console.log(`   Internal build ready: ${zipPath}`);

        // 4. Upload to Cloud
        console.log('☁️ STEP 3: Uploading to SaaS HQ Storage...');
        const fileContent = fs.readFileSync(zipPath);
        
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('system-updates')
            .upload(`binaries/${releaseName}`, fileContent, {
                contentType: 'application/zip',
                upsert: true
            });

        if (uploadError) {
            if (uploadError.message === 'Bucket not found') {
                throw new Error('Supabase Storage bucket "system-updates" does not exist. Please create it in your Supabase dashboard.');
            }
            throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
            .from('system-updates')
            .getPublicUrl(`binaries/${releaseName}`);

        // 5. Broadcase to SaaS Registry
        console.log('📝 STEP 4: Registering release in cloud database...');
        const { error: dbError } = await supabase
            .from('system_updates')
            .insert({
                version,
                download_url: publicUrl,
                notes: `Production Release v${version}\nAutomatic internal build.\nBuild Date: ${new Date().toLocaleString()}`,
                created_at: new Date().toISOString()
            });

        if (dbError) throw dbError;

        console.log('\n========================================');
        console.log('✅ PUBLISH COMPLETE!');
        console.log(`🚀 Version ${version} is now LIVE for all restaurants.`);
        console.log(`📍 Storage Path: binaries/${releaseName}`);
        console.log('========================================\n');

    } catch (error: any) {
        console.error('\n❌ PUBLISH FAILED');
        console.error(`Reason: ${error.message}`);
        process.exit(1);
    }
}

publish();
