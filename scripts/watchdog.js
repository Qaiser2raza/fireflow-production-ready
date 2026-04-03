/**
 * FireFlow Watchdog v1.0
 * Monitors Express server on port 3001 and PostgreSQL.
 * Pure Node.js built-ins + pg (already in package.json).
 * - Health check every 60s
 * - 3 consecutive fails -> restart
 * - Logs to logs/watchdog.log with timestamps + 10MB rotation
 */
import http from 'http';
import net from 'net';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const _require = createRequire(import.meta.url);
const _dir     = path.dirname(fileURLToPath(import.meta.url));
const ROOT     = path.resolve(_dir, '..');

//  Config 
const CFG = {
  PORT:       parseInt(process.env.PORT || '3001'),
  HOST:       '127.0.0.1',
  INTERVAL:   60_000,
  THRESHOLD:  3,
  LOG:        path.join(ROOT, 'logs', 'watchdog.log'),
  LOG_MAX:    10 * 1024 * 1024,
  NODE:       process.execPath,
  ARGS:       ['--import', 'tsx', path.join(ROOT, 'src', 'api', 'server.ts')],
  CWD:        ROOT,
  PG_HOST:    process.env.DB_HOST    || '127.0.0.1',
  PG_PORT:    parseInt(process.env.DB_PORT || '5432'),
  PG_DB:      process.env.PGDATABASE || 'fireflow_local',
  PG_USER:    process.env.PGUSER     || 'postgres',
  PG_PASS:    process.env.PGPASSWORD || '',
};

//  State 
let proc = null, fails = 0, restarts = 0, restarting = false;
const started = Date.now();

//  Logger 
function log(lvl, msg) {
  const ts   = new Date().toISOString().replace('T',' ').slice(0,23);
  const line = `[${ts}] [${lvl.padEnd(8)}] ${msg}\n`;
  process.stdout.write(line);
  try {
    const dir = path.dirname(CFG.LOG);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    try { if (fs.statSync(CFG.LOG).size >= CFG.LOG_MAX) fs.renameSync(CFG.LOG, CFG.LOG+'.1'); } catch(_){}
    fs.appendFileSync(CFG.LOG, line, 'utf8');
  } catch(e) { process.stderr.write('log err: '+e.message+'\n'); }
}

//  TCP check 
const tcpOk = (host, port, ms=5000) => new Promise(res => {
  const s = new net.Socket(); let done=false;
  const fin = ok => { if(!done){done=true;s.destroy();res(ok);} };
  s.setTimeout(ms); s.on('connect',()=>fin(true)); s.on('error',()=>fin(false)); s.on('timeout',()=>fin(false));
  s.connect(port, host);
});

//  HTTP /api/health check 
const httpOk = (ms=8000) => new Promise(res => {
  const r = http.request({host:CFG.HOST,port:CFG.PORT,path:'/api/health',timeout:ms}, s=>res(s.statusCode<500));
  r.on('error',()=>res(false)); r.on('timeout',()=>{r.destroy();res(false)}); r.end();
});

//  PostgreSQL check 
async function pgCheck() {
  const ok = await tcpOk(CFG.PG_HOST, CFG.PG_PORT);
  if (!ok) return { ok: false, msg: `port ${CFG.PG_PORT} closed` };
  try {
    const {Client} = _require('pg');
    const c = new Client({host:CFG.PG_HOST,port:CFG.PG_PORT,database:CFG.PG_DB,user:CFG.PG_USER,password:CFG.PG_PASS,connectionTimeoutMillis:5000});
    await c.connect(); await c.query('SELECT 1'); await c.end();
    return { ok: true, msg: 'query OK' };
  } catch(e) { return { ok: true, msg: 'TCP ok, query: '+e.message.slice(0,60) }; }
}

//  Process management 
const alive = () => proc && !proc.killed && proc.exitCode === null;

function spawn_server(reason) {
  if (alive()) return;
  restarts++;
  log('RESTART', `Reason: "${reason}" | #${restarts}`);
  try {
    proc = spawn(CFG.NODE, CFG.ARGS, { cwd:CFG.CWD, env:{...process.env}, stdio:'pipe' });
    proc.stdout.on('data', d => d.toString().trim().split('\n').forEach(l => l.trim() && log('SERVER', l.slice(0,240))));
    proc.stderr.on('data', d => d.toString().trim().split('\n').forEach(l => l.trim() && log('SRV_ERR',l.slice(0,240))));
    proc.on('exit', (c,s) => { log('WARN', `Exited code=${c} sig=${s}`); proc=null; });
    proc.on('error', e  => { log('ERROR',`spawn: ${e.message}`); proc=null; });
    log('INFO', `PID: ${proc.pid}`);
  } catch(e) { log('ERROR','spawn threw: '+e.message); }
}

function kill_server() {
  if (!alive()) return;
  const pid = proc.pid; log('INFO',`Killing PID ${pid}`);
  try {
    proc.kill('SIGTERM');
    setTimeout(() => { if(alive()) { proc.kill('SIGKILL'); log('WARN','SIGKILL sent'); } }, 10_000);
  } catch(e) { log('ERROR','kill: '+e.message); }
}

function restart(reason) {
  if (restarting) return; restarting=true;
  log('WARN', 'RESTART: '+reason);
  kill_server();
  setTimeout(() => { spawn_server(reason); restarting=false; }, 4000);
}

//  Try restart PG Windows service 
function tryRestartPg() {
  if (os.platform() !== 'win32') return;
  try {
    const out  = execSync('sc query type= all state= all', {encoding:'utf8',timeout:10_000});
    const m    = out.match(/SERVICE_NAME:\s*(postgresql[^\r\n]*)/i);
    const svc  = m ? m[1].trim() : 'postgresql';
    log('INFO', `net start "${svc}"`);
    execSync(`net start "${svc}"`, {timeout:30_000});
    log('INFO', 'PG service start sent');
  } catch(e) { log('WARN','PG svc restart: '+e.message.slice(0,80)); }
}

//  Health check cycle 
async function check() {
  const sec = Math.floor((Date.now()-started)/1000);
  const upt = `${Math.floor(sec/3600)}h${Math.floor((sec%3600)/60)}m`;
  log('CHECK', `uptime=${upt} restarts=${restarts} fails=${fails}/${CFG.THRESHOLD} pid=${proc?.pid??'none'}`);

  if (!alive()) { log('WARN','Process dead  spawning'); spawn_server('dead'); fails=0; return; }

  const [ok, pg] = await Promise.all([httpOk(), pgCheck()]);

  if (!pg.ok) { log('WARN','PG: '+pg.msg); tryRestartPg(); }
  else          log('CHECK','PG: '+pg.msg);

  if (ok) { log('OK', `Healthy :${CFG.PORT}`); fails=0; }
  else {
    fails++;
    log('WARN', `Not responding :${CFG.PORT}  fail ${fails}/${CFG.THRESHOLD}`);
    if (fails >= CFG.THRESHOLD) { fails=0; restart(`HTTP failed ${CFG.THRESHOLD}x`); }
  }
}

//  Signals 
const bye = sig => () => { log('INFO',`${sig} received  exit`); kill_server(); process.exit(0); };
process.on('SIGTERM', bye('SIGTERM'));
process.on('SIGINT',  bye('SIGINT'));
process.on('uncaughtException',  e => log('ERROR',`Uncaught: ${e.message}`));
process.on('unhandledRejection', r => log('ERROR',`Unhandled: ${r}`));

//  Boot 
log('INFO','');
log('INFO',`FireFlow Watchdog v1.0  ${os.hostname()}`);
log('INFO',`Server: http://${CFG.HOST}:${CFG.PORT}/api/health`);
log('INFO',`PostgreSQL: ${CFG.PG_HOST}:${CFG.PG_PORT}`);
log('INFO',`Interval: ${CFG.INTERVAL/1000}s | Threshold: ${CFG.THRESHOLD}`);
log('INFO',`Log: ${CFG.LOG}`);
log('INFO','');

spawn_server('watchdog startup');
setTimeout(() => { check(); setInterval(check, CFG.INTERVAL); }, 20_000);
