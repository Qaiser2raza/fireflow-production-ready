const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let store;
(async () => {
    const { default: Store } = await import('electron-store');
    store = new Store({ encryptionKey: 'fireflow-secret-key-2026' });
})();

// IPC Handlers for Secure Store
ipcMain.on('store-get', (event, key) => {
    event.returnValue = store ? store.get(key) : null;
});

ipcMain.on('store-set', (event, key, val) => {
    if (store) store.set(key, val);
});

ipcMain.on('store-delete', (event, key) => {
    if (store) store.delete(key);
});

let mainWindow;
let serverProcess;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'Fireflow Restaurant System',
        backgroundColor: '#020617',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs'),
            sandbox: false,
            webSecurity: true,
            allowRunningInsecureContent: false,
            devTools: true // Keep DevTools enabled for pilot debugging
        },
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
                    "connect-src 'self' ws: wss: http: https:; " +
                    "frame-ancestors 'none'; " +
                    "base-uri 'self'; " +
                    "form-action 'self'"
                ]
            }
        });
    });

    // In development, load the dev server
    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:3000');
    } else {
        // In production, load the local server
        mainWindow.loadURL('http://localhost:3001');
    }

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
        // Use 'npm run server' to handle TS execution via tsx, preserving production environment
        serverProcess = spawn(cmd, ['run', 'server'], {
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