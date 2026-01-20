const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'fireflow_local',
    password: 'admin123',
    port: 5432,
});

async function checkSchema() {
    const client = await pool.connect();
    try {
        const { rows } = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        `);
        const output = JSON.stringify(rows.map(r => r.table_name), null, 2);
        fs.writeFileSync('schema_output.json', output);
        console.log('Schema written to schema_output.json');
    } catch (err) {
        console.error('Error checking schema:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

checkSchema();
