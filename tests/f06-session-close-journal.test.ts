import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { CashierSessionService } from '../src/api/services/finance/CashierSessionService.js';
import { JournalEntryService } from '../src/api/services/JournalEntryService.js';

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, expected: string, actual: string) {
    if (condition) { console.log(`  PASS: ${name}`); passed++; }
    else { console.log(`  FAIL: ${name} — expected ${expected}, got ${actual}`); failed++; }
}

async function main() {
    console.log('--- STARTING F-06 SESSION-CLOSE JOURNAL BLOCKING ---');
    const ts = Date.now();
    const restaurant = await prisma.restaurants.create({
        data: { name: 'F06 Test', slug: `f06-${ts}`, currency: 'PKR', phone: '03000000000', address: 'x', timezone: 'Asia/Karachi', subscription_plan: 'BASIC', subscription_status: 'ACTIVE' }
    });
    const rid = restaurant.id;
    const hash = await bcrypt.hash('111111', 10);
    const cashier = await prisma.staff.create({ data: { restaurant_id: rid, name: 'F06 Cashier', role: 'CASHIER', hashed_pin: hash, pin: '', status: 'active' } });

    // Ensure required COA accounts exist for journal
    for (const [code, name] of [['1000', 'Cash'], ['1090', 'Manager Safe']]) {
        const existing = await prisma.chart_of_accounts.findFirst({ where: { restaurant_id: rid, code } });
        if (!existing) {
            await prisma.chart_of_accounts.create({ data: { restaurant_id: rid, code, name, type: 'ASSET', description: name, is_active: true } });
        }
    }

    const session = await prisma.cashier_sessions.create({
        data: { restaurant_id: rid, opened_by: cashier.id, status: 'OPEN', opening_float: 100 }
    });

    // ==========================================
    // Test 1: Successful journal write closes normally
    // ==========================================
    console.log('\n[Test 1] Successful journal write closes session normally');
    const closed = await CashierSessionService.closeSession(rid, session.id, 150, 50, cashier.id, 'Test close');
    assert('session status is CLOSED', closed.status === 'CLOSED', 'CLOSED', String(closed.status));
    assert('expected cash recorded', Number(closed.expected_cash) === 100, '100', String(closed.expected_cash));
    assert('difference recorded', Number(closed.difference) === 50, '50', String(closed.difference));
    const jeCount = await prisma.journal_entries.count({ where: { reference_type: 'CASHIER_SESSION', reference_id: session.id } });
    assert('session-close journal written', jeCount === 1, '1', `${jeCount}`);

    // ==========================================
    // Test 2: Simulated journal failure blocks close
    // ==========================================
    console.log('\n[Test 2] Simulated journal failure blocks close');
    const session2 = await prisma.cashier_sessions.create({
        data: { restaurant_id: rid, opened_by: cashier.id, status: 'OPEN', opening_float: 100 }
    });

    const original = JournalEntryService.prototype.recordSessionCloseJournal.bind(JournalEntryService.prototype);
    JournalEntryService.prototype.recordSessionCloseJournal = async () => {
        throw new Error('Simulated journal failure for F-06');
    };

    try {
        await CashierSessionService.closeSession(rid, session2.id, 150, 50, cashier.id, 'Test close');
        assert('close throws on journal failure', false, 'throw', 'no throw');
    } catch (e: any) {
        assert('close throws on journal failure', true, 'throw', 'throw');
        assert('distinct error code', e.message.includes('SESSION_CLOSE_JOURNAL_FAILED'), 'SESSION_CLOSE_JOURNAL_FAILED', e.message);
    }

    const session2After = await prisma.cashier_sessions.findUnique({ where: { id: session2.id } });
    assert('session remains OPEN after journal failure', session2After?.status === 'OPEN', 'OPEN', String(session2After?.status || 'missing'));

    // Restore and retry
    JournalEntryService.prototype.recordSessionCloseJournal = original;
    const closed2 = await CashierSessionService.closeSession(rid, session2.id, 150, 50, cashier.id, 'Test close retry');
    assert('retry close succeeds', closed2.status === 'CLOSED', 'CLOSED', String(closed2.status));
    const jeCount2 = await prisma.journal_entries.count({ where: { reference_type: 'CASHIER_SESSION', reference_id: session2.id } });
    assert('journal written on retry', jeCount2 === 1, '1', `${jeCount2}`);

    console.log(`\n=== F-06 REPORT ===`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    if (failed > 0) {
        console.log('F-06: NOT COMPLETE — failures detected');
        process.exit(1);
    } else {
        console.log('F-06: VERIFICATION PASSED');
        process.exit(0);
    }
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
