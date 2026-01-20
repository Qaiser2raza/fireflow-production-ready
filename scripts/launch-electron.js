import { spawn } from 'child_process';
import path from 'path';

const env = { ...process.env };
// CRITICAL: Unset this to prevent Electron from running as a Node process
delete env.ELECTRON_RUN_AS_NODE;

const isWindows = process.platform === 'win32';
const cmd = isWindows ? 'npx.cmd' : 'npx';

const electronProcess = spawn(cmd, ['electron', '.'], {
    env,
    stdio: 'inherit',
    shell: true
});

electronProcess.on('close', (code) => {
    process.exit(code);
});
