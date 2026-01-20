// verify-backend.js (ES Module)
const API_BASE = 'http://localhost:3001/api';

console.log("=== STARTING BACKEND VERIFICATION ===");

async function testBackend() {
    try {
        // 1. CREATE TEST TABLE
        console.log("\n1. Creating Test Table...");
        const createRes = await fetch(`${API_BASE}/tables`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'TEST-DEL-1',
                capacity: 4,
                section_id: null,
                shape: 'rect'
            })
        });

        if (!createRes.ok) {
            console.error("FAILED to create table:", await createRes.text());
            return;
        }
        const table = await createRes.json();
        console.log("Created table:", table.id);

        // 2. DELETE TEST TABLE (Correct Syntax)
        console.log("\n2. Deleting Table (Correct Syntax)...");
        const deleteRes = await fetch(`${API_BASE}/tables?id=${table.id}`, { method: 'DELETE' });
        if (deleteRes.ok) {
            console.log("SUCCESS: Table deleted with id=" + table.id);
        } else {
            console.error("FAILED: " + deleteRes.status + " " + await deleteRes.text());
        }

        // 3. CREATE 2 TABLES FOR MERGE
        console.log("\n3. Creating 2 Tables for Merge...");
        const t1 = await (await fetch(`${API_BASE}/tables`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'M-1', capacity: 2 })
        })).json();
        const t2 = await (await fetch(`${API_BASE}/tables`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'M-2', capacity: 2 })
        })).json();
        console.log(`Created ${t1.id} and ${t2.id}`);

        // 4. MERGE TABLES
        console.log("\n4. Merging Tables...");
        const mergeId = "MERGE-" + Date.now();
        const mergeRes = await fetch(`${API_BASE}/tables/merge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tableIds: [t1.id, t2.id],
                mergeId: mergeId
            })
        });

        if (mergeRes.ok) {
            console.log("SUCCESS: Merge API returned 200 OK");
        } else {
            console.error("FAILED to merge:", mergeRes.status, await mergeRes.text());
        }

        // CLEANUP
        console.log("\n5. Cleanup...");
        await fetch(`${API_BASE}/tables?id=${t1.id}`, { method: 'DELETE' });
        await fetch(`${API_BASE}/tables?id=${t2.id}`, { method: 'DELETE' });
        console.log("Done.");

    } catch (err) {
        console.error("SCRIPT ERROR:", err);
    }
}

testBackend();
