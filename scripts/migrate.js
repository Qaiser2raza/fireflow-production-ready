import fs from 'fs/promises';
import path from 'path';
import { Client } from 'pg';

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');

const client = new Client({
  host: process.env.PGHOST || 'localhost',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'admin123',
  database: process.env.PGDATABASE || 'fireflow_local',
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
});

async function run() {
  await client.connect();

  // Ensure migrations table exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS _applied_migrations (
      id serial primary key,
      filename text not null unique,
      applied_at timestamptz not null default now()
    )
  `);

  const files = await fs.readdir(MIGRATIONS_DIR);
  const sqlFiles = files
    .filter(f => f.endsWith('.sql') && !f.startsWith('rollback') && !f.startsWith('safe_rollback'))
    .sort();

  if (!sqlFiles.length) {
    console.log('No migrations found.');
    await client.end();
    return;
  }

  // Fetch already applied migrations
  const { rows: appliedRows } = await client.query('SELECT filename FROM _applied_migrations');
  const applied = new Set(appliedRows.map(r => r.filename));

  for (const file of sqlFiles) {
    if (applied.has(file)) {
      console.log('Skipping already-applied migration:', file);
      continue;
    }

    const p = path.join(MIGRATIONS_DIR, file);
    const sql = await fs.readFile(p, 'utf8');
    console.log('Applying migration:', file);
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _applied_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log('Applied:', file);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Error applying', file, err.message || err);
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
  console.log('Migrations complete.');
}

run().catch(err => {
  console.error('Migration runner failed:', err);
  process.exit(1);
});
