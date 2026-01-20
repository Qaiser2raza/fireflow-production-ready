const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'fireflow_local',
    password: 'admin123',
    port: 5432,
});

async function checkColumn() {
    const client = await pool.connect();
    try {
        const { rows } = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'restaurants' AND column_name = 'owner_id';
        `);
        console.log('owner_id exists:', rows.length > 0);
    } catch (err) {
        console.error('Error checking column:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

checkColumn();
