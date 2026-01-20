import { spawn } from 'child_process';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const isWindows = process.platform === 'win32';
const cmd = isWindows ? 'npx.cmd' : 'npx';

// Run the diagnostic script using the launcher
const electronProcess = spawn(cmd, ['electron', 'test-electron.cjs'], {
    env,
    stdio: 'inherit',
    shell: true
});

electronProcess.on('close', (code) => {
    process.exit(code);
});
