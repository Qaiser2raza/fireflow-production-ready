
import net from 'net';
import { prisma } from '../../shared/lib/prisma';
import { exec } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export class PrinterService {
    /**
     * Prints HTML to a local Windows printer using mshtml
     */
    static async printLocal(htmlContent: string, printerName: string): Promise<{ success: boolean; message: string }> {
        const tempFile = join(tmpdir(), `fireflow-print-${Date.now()}.html`);
        try {
            writeFileSync(tempFile, htmlContent, 'utf8');
            await new Promise<void>((resolve, reject) => {
                exec(
                    `rundll32.exe mshtml.dll,PrintHTML "${tempFile}" "${printerName}"`,
                    { timeout: 10000 },
                    (err) => (err ? reject(err) : resolve())
                );
            });
            return { success: true, message: `Printed to ${printerName}` };
        } catch (err: any) {
            console.error('Local print error:', err);
            return { success: false, message: err.message };
        } finally {
            try { unlinkSync(tempFile); } catch {}
        }
    }

    /**
     * Unified print method
     */
    static async printDocument(printerId: string, htmlContent: string): Promise<void> {
        const printer = await prisma.printers.findUnique({ where: { id: printerId } });
        if (!printer) throw new Error('Printer not found');

        if (printer.connection_type === 'LOCAL') {
            if (!printer.printer_name) throw new Error('Local printer name not configured');
            const result = await this.printLocal(htmlContent, printer.printer_name);
            if (!result.success) throw new Error(result.message);
        } else {
            if (!printer.ip_address) throw new Error('Network printer has no IP address configured');
            const ip = printer.ip_address;
            return new Promise((resolve, reject) => {
                const socket = new net.Socket();
                socket.connect(printer.port, ip, () => {
                    const init = '\x1B\x40'; 
                    const cut = '\x1D\x56\x41\x03'; 
                    
                    const textContent = htmlContent
                        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                        .replace(/<[^>]+>/g, '\n')
                        .replace(/\n\s*\n/g, '\n');

                    socket.write(init + '\n' + textContent + '\n\n\n' + cut);
                    socket.end();
                    resolve();
                });
                socket.on('error', (err) => reject(err));
            });
        }
    }

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
