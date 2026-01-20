import { app, BrowserWindow, dialog } from 'electron'
import path from 'node:path'
import { fork } from 'child_process'
import fs from 'node:fs'

// --- LOGGING SETUP (Writes to a file on your desktop for debugging) ---
const logPath = path.join(app.getPath('desktop'), 'fireflow-debug.log');
function log(msg: string) {
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
}

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(__dirname, '../public')

let win: BrowserWindow | null
let serverProcess: any = null

function startServer() {
  if (serverProcess) return

  log('Attempting to start server...');

  // CRITICAL: Precise Path Logic
  // Replace your existing path logic with this:
const isDev = !app.isPackaged;
let serverPath = '';

if (!isDev) {
  // Production (Packaged)
  serverPath = path.join(process.resourcesPath, 'server.cjs');
} else {
  // Development (npm run electron)
  // We use process.cwd() to ensure we are looking in the project root
  serverPath = path.join(process.cwd(), 'server.cjs');
}

log(`Resolved Server Path: ${serverPath}`);

  // Spawn Server
  serverProcess = fork(serverPath, [], {
    env: { 
      ...process.env, 
      NODE_ENV: app.isPackaged ? 'production' : 'development',
      // Pass the db path explicitly if needed, mostly handled by Prisma
    },
    stdio: 'pipe' // Capture output
  })

  // Capture Server Logs
  serverProcess.stdout?.on('data', (data: any) => log(`SERVER [OUT]: ${data}`));
  serverProcess.stderr?.on('data', (data: any) => log(`SERVER [ERR]: ${data}`));
  
  serverProcess.on('error', (err: any) => {
    log(`SERVER FAILED TO START: ${err.message}`);
  })
}

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    },
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(process.env.DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (serverProcess) {
    log('Killing server process...');
    serverProcess.kill()
    serverProcess = null
  }
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.whenReady().then(() => {
  startServer()
  createWindow()
})