const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'fireflow_local',
    password: 'admin123',
    port: 5432,
});

async function checkPK() {
    const client = await pool.connect();
    try {
        const { rows } = await client.query(`
            SELECT a.attname
            FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = '"restaurants"'::regclass
            AND i.indisprimary;
        `);
        console.log('Primary Key columns (restaurants):', rows.map(r => r.attname).join(', '));
    } catch (err) {
        console.error('Error checking PK:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

checkPK();
