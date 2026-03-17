const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let store;
(async () => {
    try {
        console.log('[MAIN] Initializing Secure Store...');
        const { default: Store } = await import('electron-store');
        store = new Store({ encryptionKey: 'fireflow-secret-key-2026' });
        console.log('[MAIN] Secure Store Ready.');
    } catch (e) {
        console.error('[MAIN] Failed to initialize electron-store:', e);
        // Fallback or handle missing store
    }
})();

// IPC Handlers for Secure Store
ipcMain.on('store-get', (event, key) => {
    if (!store) {
        console.warn(`[IPC] Store not ready for GET: ${key}`);
        event.returnValue = null;
        return;
    }
    event.returnValue = store.get(key);
});

ipcMain.on('store-set', (event, key, val) => {
    if (store) store.set(key, val);
    else console.warn(`[IPC] Store not ready for SET: ${key}`);
});

ipcMain.on('store-delete', (event, key) => {
    if (store) store.delete(key);
    else console.warn(`[IPC] Store not ready for DELETE: ${key}`);
});

// 🔌 HARDWARE: PRINTER AGENT
ipcMain.handle('get-printers', async () => {
    if (!mainWindow) return [];
    try {
        return await mainWindow.webContents.getPrintersAsync();
    } catch (e) {
        console.error("[IPC] Failed to get printers:", e);
        return [];
    }
});

ipcMain.handle('print-thermal', async (event, { html, printerName, silent = true }) => {
    console.log(`[IPC] Thermal Print initiated to: ${printerName} (Silent: ${silent})`);
    const printWindow = new BrowserWindow({ 
        show: false, 
        width: 300, // Small width for layout simulation
        webPreferences: { 
            nodeIntegration: false,
            contextIsolation: true
        } 
    });
    
    // Verify printer existence if not using default
    if (printerName && printerName !== 'Default') {
        try {
            const printers = await printWindow.webContents.getPrintersAsync();
            const exists = printers.some(p => p.name === printerName);
            if (!exists) {
                console.warn(`[IPC] Printer "${printerName}" not found in system printers. Available:`, printers.map(p => p.name).join(', '));
                printWindow.close();
                return { success: false, error: `Printer "${printerName}" not found. Available printers: ${printers.map(p => p.name).join(', ')}` };
            }
        } catch (e) {
            console.error("[IPC] Failed to verify printers:", e);
        }
    }

    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    
    return new Promise((resolve) => {
        printWindow.webContents.print({
            silent: silent,
            printBackground: true,
            deviceName: (printerName === 'Default' || !printerName) ? undefined : printerName,
            margins: { marginType: 'none' },
            pageSize: { width: 80000, height: 297000 } // Standard 80mm roll width
        }, (success, errorType) => {
            console.log(`[IPC] Print result: ${success}, Error: ${errorType}`);
            printWindow.close();
            resolve({ success, error: errorType });
        });
    });
});

// 🖨️ HARDWARE: A4 PRINTER (HP LaserJet / standard paper)
ipcMain.handle('print-a4', async (event, { html, printerName }) => {
    console.log(`[IPC] A4 Print initiated to: ${printerName}`);
    const printWindow = new BrowserWindow({
        show: false,
        width: 794, // A4 width in pixels at 96dpi
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Verify printer existence
    if (printerName && printerName !== 'Default') {
        try {
            const printers = await printWindow.webContents.getPrintersAsync();
            const exists = printers.some(p => p.name === printerName);
            if (!exists) {
                console.warn(`[IPC] A4 Printer "${printerName}" not found.`);
                printWindow.close();
                return {
                    success: false,
                    error: `Printer "${printerName}" not found. Available: ${printers.map(p => p.name).join(', ')}`
                };
            }
        } catch (e) {
            console.error('[IPC] Failed to verify A4 printers:', e);
        }
    }

    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    return new Promise((resolve) => {
        printWindow.webContents.print({
            silent: true,
            printBackground: true,
            deviceName: (printerName === 'Default' || !printerName) ? undefined : printerName,
            margins: { marginType: 'printableArea' },
            pageSize: 'A4'
        }, (success, errorType) => {
            console.log(`[IPC] A4 Print result: ${success}, Error: ${errorType}`);
            printWindow.close();
            resolve({ success, error: errorType });
        });
    });
});

// --- 🖨️ HARDWARE: THERM-SYNC PRINT LOGIC ---
ipcMain.on('PRINT_DELIVERY_SLIP', async (event, payload) => {
    const { orderIds, driverId } = payload;
    const http = require('http');

    console.log(`[PRINT_SERVER] Received request for ${orderIds.length} slips. Pilot id: ${driverId}`);

    for (const id of orderIds) {
        // 1. Fetch High-Fidelity Data from local API
        http.get(`http://127.0.0.1:3001/api/orders/${id}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const order = JSON.parse(data);
                    generateSlip(order);
                } catch (e) {
                    console.error("[PRINT_SERVER] Failed to parse order for print:", e);
                }
            });
        }).on('error', (err) => {
            console.error("[PRINT_SERVER] Print fetch failed:", err);
        });
    }
});

function generateSlip(order) {
    const items = order.order_items || [];
    const isPaid = order.status === 'PAID' || order.payment_status === 'PAID';

    const itemRows = items
        .map(i => `<tr>
            <td style="padding:2px 4px;">${i.quantity}x</td>
            <td style="padding:2px 4px;">${i.item_name || 'Item'}</td>
            <td style="padding:2px 4px; text-align:right;">Rs.${i.total_price}</td>
        </tr>`)
        .join('');

    const html = `
    <html><head><style>
        body { font-family: 'Courier New', monospace; font-size: 11px; margin: 0; padding: 4px; width: 280px; }
        h2 { text-align: center; font-size: 13px; margin: 4px 0; }
        .divider { border-top: 1px dashed #000; margin: 4px 0; }
        table { width: 100%; border-collapse: collapse; }
        .total { font-size: 13px; font-weight: bold; }
        .center { text-align: center; }
        .badge { text-align: center; font-weight: bold; font-size: 12px; padding: 3px; border: 1px solid #000; }
    </style></head><body>
        <h2>FIREFLOW DELIVERY</h2>
        <div class="divider"></div>
        <p style="margin:2px 0;">ORDER: #${order.id.split('-').pop().toUpperCase()}</p>
        <p style="margin:2px 0;">DATE: ${new Date(order.created_at).toLocaleString()}</p>
        <p style="margin:2px 0;">RIDER: ${order.assigned_driver_id ? order.assigned_driver_id.slice(-6).toUpperCase() : 'UNASSIGNED'}</p>
        <div class="divider"></div>
        <p style="margin:2px 0;"><b>CUSTOMER:</b> ${order.customer_name || 'GUEST'}</p>
        <p style="margin:2px 0;"><b>PHONE:</b> ${order.customer_phone || 'N/A'}</p>
        <p style="margin:2px 0;"><b>ADDRESS:</b> ${order.delivery_address || 'PICKUP'}</p>
        <div class="divider"></div>
        <table>${itemRows}</table>
        <div class="divider"></div>
        <table>
            <tr><td>Subtotal</td><td style="text-align:right;">Rs.${order.total - (order.delivery_fee || 0)}</td></tr>
            <tr><td>Delivery</td><td style="text-align:right;">Rs.${order.delivery_fee || 0}</td></tr>
            <tr class="total"><td>TOTAL</td><td style="text-align:right;">Rs.${order.total}</td></tr>
        </table>
        <div class="divider"></div>
        <div class="badge">${isPaid ? '⭐ PREPAID' : '💵 CASH ON DELIVERY'}</div>
        <p class="center" style="font-size:9px; margin-top:6px;">FireFlow POS v1.0</p>
    </body></html>`;

    // Send to thermal printer using the already-implemented print-thermal handler
    if (mainWindow) {
        const printWindow = new BrowserWindow({
            show: false,
            width: 300,
            webPreferences: { nodeIntegration: false, contextIsolation: true }
        });

        printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).then(() => {
            printWindow.webContents.print({
                silent: true,
                printBackground: true,
                margins: { marginType: 'none' },
                pageSize: { width: 80000, height: 297000 }
            }, (success, errorType) => {
                console.log(`[DELIVERY SLIP] Print result: ${success}, Error: ${errorType}`);
                printWindow.close();
            });
        });
    } else {
        console.log('[DELIVERY SLIP] mainWindow not available, skipping print.');
    }
}

let mainWindow;
let serverProcess;

function createWindow() {
    console.log('[MAIN] Creating Window...');
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'Fireflow Restaurant System',
        backgroundColor: '#020617',
        show: false, // Don't show until ready-to-show
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs'),
            sandbox: false,
            webSecurity: true,
            allowRunningInsecureContent: false,
            devTools: true
        },
    });

    mainWindow.once('ready-to-show', () => {
        console.log('[MAIN] Window Ready to Show. Displaying...');
        mainWindow.show();
        // Automatically open devtools in development to see console errors
        if (process.env.NODE_ENV === 'development') {
            mainWindow.webContents.openDevTools();
        }
    });

    // 🚨 DEBUGGING: Capture Renderer Crashes
    mainWindow.webContents.on('crashed', (event) => {
        console.error("❌ RENDERER PROCESS CRASHED!", event);
    });

    mainWindow.on('unresponsive', () => {
        console.error("⚠️ WINDOW UNRESPONSIVE");
    });

    // 🔒 Set Content Security Policy
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self'; " +
                    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
                    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
                    "img-src 'self' data: https:; " +
                    "font-src 'self' data: https://fonts.gstatic.com; " +
                    "connect-src 'self' ws: wss: http://localhost:3000 http://localhost:3001 http://127.0.0.1:3001; " +
                    "frame-ancestors 'none'; " +
                    "base-uri 'self'; " +
                    "form-action 'self'"
                ]
            }
        });
    });

    // In development, load the dev server
    const targetUrl = process.env.NODE_ENV === 'development'
        ? 'http://localhost:3000'
        : 'http://localhost:3001';

    console.log(`[MAIN] Loading URL: ${targetUrl}`);
    mainWindow.loadURL(targetUrl).catch(err => {
        console.error(`[MAIN] Failed to load URL: ${targetUrl}`, err);
    });

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

function startServer() {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows ? 'npm.cmd' : 'npm';

    if (process.env.NODE_ENV === 'development') {
        console.log('Starting server in DEVELOPMENT mode (spawn)');
        serverProcess = spawn(cmd, ['run', 'server'], {
            env: { ...process.env, NODE_ENV: 'development' },
            stdio: 'inherit',
            shell: true
        });
    } else {
        console.log('Starting server in PRODUCTION mode (spawn)');
        // In production, execute the bundled server directly
        serverProcess = spawn('node', ['server.cjs'], {
            env: { ...process.env, NODE_ENV: 'production' },
            stdio: 'inherit',
            shell: true
        });
    }
}

async function waitForServer() {
    const http = require('http');
    const maxAttempts = 60; // Increased to 60 seconds
    const port = 3001;

    console.log(`Checking server connectivity at http://127.0.0.1:${port}/api/health...`);

    for (let i = 0; i < maxAttempts; i++) {
        try {
            await new Promise((resolve, reject) => {
                const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
                    // 200 = OK. 500 = Server is up but maybe DB issue (still counts as server UP for Electron to load)
                    if (res.statusCode === 200 || res.statusCode === 500) {
                        resolve();
                    } else {
                        reject(new Error(`Status Code: ${res.statusCode}`));
                    }
                });
                req.on('error', reject);
                req.setTimeout(900); // Short timeout for checking
            });
            console.log('✅ Server connection established!');
            return; // Server is ready
        } catch (err) {
            // Log every 5 seconds to show progress
            if (i % 5 === 0) console.log(`Waiting for server... attempt ${i + 1}/${maxAttempts}`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    throw new Error('Server failed to start within 60 seconds. Check console for server errors.');
}

app.on('ready', async () => {
    startServer();

    console.log('Waiting for server to start...');
    try {
        await waitForServer();
        console.log('Server ready, creating window...');
        createWindow();
    } catch (e) {
        console.error("Failed to connect to server:", e);
        // Open window anyway so we can see errors
        createWindow();
    }
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        if (serverProcess) serverProcess.kill();
        app.quit();
    }
});

app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});