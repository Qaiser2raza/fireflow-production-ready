/**
 * M035 Track D cutover utility. It is report-only by default; pass --confirm
 * only after the shift_sessions migration has been deployed and the report is reviewed.
 */
import { PrismaClient, ShiftStatus } from '@prisma/client';
import { calculateBusinessDate } from '../services/finance/ShiftSessionService';

const prisma = new PrismaClient();
const confirm = process.argv.includes('--confirm');
const migrationTime = new Date();

type LegacySession = Awaited<ReturnType<typeof prisma.cashier_sessions.findMany>>[number];

function businessKey(session: LegacySession, restaurant: { day_start: string; day_end: string; timezone: string | null }): string {
  return `${session.restaurant_id}:${calculateBusinessDate({ dayStart: restaurant.day_start, dayEnd: restaurant.day_end, timezone: restaurant.timezone }, session.opened_at).toISOString().slice(0, 10)}`;
}

async function main() {
  const [sessions, restaurants] = await Promise.all([
    prisma.cashier_sessions.findMany({ orderBy: { opened_at: 'asc' } }),
    prisma.restaurants.findMany({ select: { id: true, day_start: true, day_end: true, timezone: true } }),
  ]);
  const restaurantById = new Map(restaurants.map((restaurant) => [restaurant.id, restaurant]));
  const groups = new Map<string, LegacySession[]>();
  for (const session of sessions) {
    const restaurant = restaurantById.get(session.restaurant_id);
    if (!restaurant) throw new Error(`Missing restaurant for legacy session ${session.id}`);
    const key = businessKey(session, restaurant);
    groups.set(key, [...(groups.get(key) || []), session]);
  }
  const concurrentOpenGroups = [...groups.entries()].filter(([, group]) => group.filter((session) => session.status === 'OPEN').length > 1);
  console.log(JSON.stringify({
    mode: confirm ? 'EXECUTE' : 'REPORT_ONLY', legacySessions: sessions.length, restaurantBusinessDateGroups: groups.size,
    concurrentOpenGroups: concurrentOpenGroups.map(([key, group]) => ({ key, openSessionIds: group.filter((session) => session.status === 'OPEN').map((session) => session.id) })),
  }, null, 2));
  if (!confirm) { console.log('No data changed. Re-run with --confirm after reviewing this report.'); return; }

  let created = 0;
  let reconciled = 0;
  for (const [key, group] of groups) {
    const openSessions = group.filter((session) => session.status === 'OPEN').sort((a, b) => b.opened_at.getTime() - a.opened_at.getTime() || b.id.localeCompare(a.id));
    const retainedOpenId = openSessions[0]?.id;
    for (const session of group) {
      const marker = `Legacy cashier session ${session.id}`;
      const alreadyMigrated = await prisma.shift_sessions.findFirst({ where: { restaurant_id: session.restaurant_id, notes: { contains: marker } }, select: { id: true } });
      if (alreadyMigrated) continue;
      const restaurant = restaurantById.get(session.restaurant_id)!;
      const isReconciledOpen = session.status === 'OPEN' && session.id !== retainedOpenId;
      const remainsOpen = session.status === 'OPEN' && session.id === retainedOpenId;
      const status = remainsOpen ? ShiftStatus.OPEN : ShiftStatus.CLOSED;
      const date = calculateBusinessDate({ dayStart: restaurant.day_start, dayEnd: restaurant.day_end, timezone: restaurant.timezone }, session.opened_at);
      const reconciliationNote = isReconciledOpen
        ? ` Legacy reconciliation: converted to CLOSED during shift model migration on ${migrationTime.toISOString()}. No cash count was invented; nullable legacy values are preserved.`
        : '';
      await prisma.shift_sessions.create({ data: {
        restaurant_id: session.restaurant_id, business_date: date, day_start: session.opened_at,
        day_end: remainsOpen ? null : (session.closed_at || migrationTime), status,
        opening_float: session.opening_float, expected_cash: session.expected_cash || session.opening_float,
        actual_cash: session.actual_cash, difference: session.difference, terminal_id: session.terminal_id,
        notes: `${marker}.${reconciliationNote}`, opened_by: session.opened_by,
        closed_by: remainsOpen ? null : session.closed_by,
      } });
      created += 1;
      if (isReconciledOpen) reconciled += 1;
    }
    const [restaurantId] = key.split(':');
    await prisma.audit_logs.create({ data: {
      restaurant_id: restaurantId, action_type: 'SHIFT_MIGRATION', entity_type: 'SHIFT_SESSION', entity_id: restaurantId,
      details: { migration_time: migrationTime.toISOString(), group: key, source_sessions: group.map((session) => session.id), retained_open_session_id: retainedOpenId || null },
    } });
  }
  console.log(JSON.stringify({ createdShiftSessions: created, reconciledOpenSessions: reconciled, migrationAuditEntries: groups.size }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
