import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, 'prisma/dev.db'), { readonly: true });

const rows = db.prepare(
    `SELECT entry_type, amount, balance_after, description, created_at 
     FROM customer_ledgers 
     ORDER BY created_at DESC 
     LIMIT 15`
).all();

console.log(JSON.stringify(rows, null, 2));
db.close();
