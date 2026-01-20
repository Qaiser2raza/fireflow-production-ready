const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'fireflow_local',
    password: 'admin123',
    port: 5432,
});

async function describeTable() {
    const client = await pool.connect();
    try {
        const { rows } = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'staff'
            ORDER BY ordinal_position;
        `);
        fs.writeFileSync('staff_description.json', JSON.stringify(rows, null, 2));
        console.log('Staff table described.');
    } catch (err) {
        console.error('Error describing table:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

describeTable();
