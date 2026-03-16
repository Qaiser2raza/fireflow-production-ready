import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import { getLatestVersion } from '../../shared/lib/cloudClient';
import pkg from '../../../package.json' assert { type: 'json' };

const execAsync = promisify(exec);

export class UpdateService {
    private static instance: UpdateService;
    private currentVersion: string = pkg.version;

    public static getInstance() {
        if (!UpdateService.instance) {
            UpdateService.instance = new UpdateService();
        }
        return UpdateService.instance;
    }

    /**
     * Compare local version with cloud version
     */
    public async checkUpdate() {
        const { data, error } = await getLatestVersion();
        
        if (error || !data) {
            return { hasUpdate: false, error };
        }

        const isNewer = this.compareVersions(data.version, this.currentVersion) > 0;

        return {
            hasUpdate: isNewer,
            currentVersion: this.currentVersion,
            latestVersion: data.version,
            notes: data.notes,
            downloadUrl: data.download_url
        };
    }

    /**
     * Simple semver comparison
     */
    private compareVersions(v1: string, v2: string): number {
        const a = v1.split('.').map(Number);
        const b = v2.split('.').map(Number);
        
        for (let i = 0; i < 3; i++) {
            if (a[i] > b[i]) return 1;
            if (a[i] < b[i]) return -1;
        }
        return 0;
    }

    /**
     * Trigger the actual update process
     * This usually involves spawning a detached process that handles the swap
     */
    public async applyUpdate(downloadUrl: string) {
        try {
            const updateDir = path.join(process.cwd(), 'updates');
            if (!fs.existsSync(updateDir)) fs.mkdirSync(updateDir);

            const zipPath = path.join(updateDir, 'update.zip');
            
            // 1. Download binary
            const response = await axios({
                url: downloadUrl,
                method: 'GET',
                responseType: 'stream'
            });

            const writer = fs.createWriteStream(zipPath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            // 2. Spawn the updater script
            // On Windows, we spawn a PowerShell script that waits for the server to exit,
            // unzips the files, runs migrations, and restarts.
            const updaterScript = path.join(process.cwd(), 'installer', 'Apply-Update.ps1');
            
            if (!fs.existsSync(updaterScript)) {
                throw new Error('Updater script missing in installer/ folder');
            }

            // Detached execution so the server can exit
            const child = exec(`status powershell.exe -ExecutionPolicy Bypass -File "${updaterScript}" -ZipPath "${zipPath}"`, {
                detached: true,
                stdio: 'ignore'
            });
            child.unref();

            return { success: true, message: 'Update process initiated. System will restart shortly.' };
        } catch (error: any) {
            console.error('[UPDATE] Apply failed:', error);
            throw new Error(`Update application failed: ${error.message}`);
        }
    }
}

export const updateService = UpdateService.getInstance();
