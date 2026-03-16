
import net from 'net';
import { prisma } from '../../shared/lib/prisma';

export class PrinterService {
    /**
     * Checks if a printer is reachable via TCP
     */
    static async testConnection(ip: string, port: number): Promise<{ success: boolean; message: string }> {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            let resolved = false;

            // Timeout after 3 seconds
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    socket.destroy();
                    resolve({ success: false, message: 'Connection timed out' });
                }
            }, 3000);

            socket.connect(port, ip, () => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    socket.write('\x1B\x40'); // ESC @ (Initialize printer)
                    socket.end();
                    resolve({ success: true, message: 'Printer is reachable' });
                }
            });

            socket.on('error', (err) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    resolve({ success: false, message: err.message });
                }
            });
        });
    }

    /**
     * Sends a test print page to the printer
     */
    static async sendTestPrint(ip: string, port: number, printerName: string): Promise<{ success: boolean; message: string }> {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            
            socket.connect(port, ip, () => {
                // ESC/POS Commands
                const init = '\x1B\x40'; // Initialize
                const center = '\x1B\x61\x01'; // Center align
                const bold = '\x1B\x45\x01'; // Bold on
                const normal = '\x1B\x45\x00'; // Bold off
                const big = '\x1D\x21\x11'; // Double height and width
                const resetSize = '\x1D\x21\x00';
                const feed = '\n\n\n';
                const cut = '\x1D\x56\x41\x03'; // Paper cut

                const content = [
                    init,
                    center,
                    big, bold, 'FIREFLOW POS\n', resetSize, normal,
                    '--------------------------------\n',
                    'HARDWARE TEST SUCCESSFUL\n',
                    `Printer: ${printerName}\n`,
                    `IP: ${ip}:${port}\n`,
                    `Time: ${new Date().toLocaleString()}\n`,
                    '--------------------------------\n',
                    'Powered by Antigravity AI\n',
                    feed,
                    cut
                ].join('');

                socket.write(content);
                socket.end();
                resolve({ success: true, message: 'Test print sent' });
            });

            socket.on('error', (err) => {
                resolve({ success: false, message: `Print failed: ${err.message}` });
            });
        });
    }

    /**
     * Get all active printers for a restaurant
     */
    static async getAutoPrinters(restaurantId: string) {
        return prisma.printers.findMany({
            where: {
                restaurant_id: restaurantId,
                is_active: true
            },
            include: {
                stations: true
            }
        });
    }
}
