import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure directory exists
const UPLOADS_DIR = path.join(__dirname, '../uploads/menu');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Downloads an image from the web and saves it to the local uploads directory.
 * Returns the relative URL for the browser.
 */
export async function downloadImage(url) {
    if (!url || !url.startsWith('http')) return null;

    try {
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream'
        });

        // Determine extension
        let ext = '.png';
        const contentType = response.headers['content-type'];
        if (contentType?.includes('jpeg') || contentType?.includes('jpg')) ext = '.jpg';
        if (contentType?.includes('webp')) ext = '.webp';

        const filename = `menu_${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`;
        const filePath = path.join(UPLOADS_DIR, filename);

        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(`/uploads/menu/${filename}`));
            writer.on('error', reject);
        });
    } catch (error) {
        console.error(`Failed to download image from ${url}:`, error.message);
        return null;
    }
}
