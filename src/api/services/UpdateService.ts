import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import axios from 'axios';
import { getLatestVersion } from '../../shared/lib/cloudClient';
import pkg from '../../../package.json' assert { type: 'json' };

export class UpdateService {
    private static instance: UpdateService;
    private currentVersion: string = pkg.version;
    private checkIntervalMs: number = 60 * 60 * 1000; // 1 hour
    private intervalHandle: NodeJS.Timeout | null = null;

    public static getInstance() {
        if (!UpdateService.instance) {
            UpdateService.instance = new UpdateService();
        }
        return UpdateService.instance;
    }

    /**
     * Start background polling for updates.
     * Call this once from server.ts after the server starts listening.
     */
    public startPolling() {
        console.log(`[UpdateService] Polling started. Current version: ${this.currentVersion}`);
        // First check 30s after boot to not interfere with startup
        setTimeout(() => this.checkAndApply(), 30 * 1000);
        this.intervalHandle = setInterval(() => this.checkAndApply(), this.checkIntervalMs);
    }

    public stopPolling() {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
    }

    private async checkAndApply() {
        try {
            const result = await this.checkUpdate();
            if (result.hasUpdate && result.downloadUrl) {
                console.log(`[UpdateService] New version: ${result.latestVersion} (current: ${result.currentVersion})`);
                await this.applyUpdate(result.downloadUrl);
            } else {
                console.log(`[UpdateService] Up to date (${this.currentVersion})`);
            }
        } catch (err: any) {
            console.error('[UpdateService] Poll error:', err.message);
        }
    }

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

    private compareVersions(v1: string, v2: string): number {
        const a = v1.split('.').map(Number);
        const b = v2.split('.').map(Number);
        for (let i = 0; i < 3; i++) {
            if ((a[i] || 0) > (b[i] || 0)) return 1;
            if ((a[i] || 0) < (b[i] || 0)) return -1;
        }
        return 0;
    }

    public async applyUpdate(downloadUrl: string) {
        try {
            const appRoot = process.cwd();
            const updateDir = path.join(appRoot, 'updates');
            if (!fs.existsSync(updateDir)) fs.mkdirSync(updateDir, { recursive: true });

            const zipPath = path.join(updateDir, 'update.zip');

            // Download the zip
            console.log(`[UpdateService] Downloading from ${downloadUrl}...`);
            const response = await axios({
                url: downloadUrl,
                method: 'GET',
                responseType: 'stream',
                timeout: 5 * 60 * 1000
            });

            const writer = fs.createWriteStream(zipPath);
            response.data.pipe(writer);
            await new Promise<void>((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            console.log(`[UpdateService] Download complete: ${zipPath}`);

            // Locate updater script - lives in <appRoot>/installer/
            const updaterScript = path.join(appRoot, 'installer', 'Apply-Update.ps1');
            if (!fs.existsSync(updaterScript)) {
                throw new Error(`Updater script not found: ${updaterScript}. Ensure Apply-Update.ps1 is in the installer/ folder.`);
            }

            // Spawn detached PowerShell process
            const psCommand = `powershell.exe -ExecutionPolicy Bypass -File "${updaterScript}" -ZipPath "${zipPath}" -AppDir "${appRoot}"`;
            console.log(`[UpdateService] Spawning: ${psCommand}`);

            const child = exec(psCommand);
            child.unref();

            return {
                success: true,
                message: 'Update downloaded. System will apply and restart within 30 seconds.'
            };
        } catch (error: any) {
            console.error('[UpdateService] applyUpdate failed:', error);
            throw new Error(`Update failed: ${error.message}`);
        }
    }
}

export const updateService = UpdateService.getInstance();
