import assert from 'node:assert/strict';
import test from 'node:test';
import { CashierSessionController } from './CashierSessionController';
import { CashierSessionService } from '../services/finance/CashierSessionService';

function responseCapture() {
  const capture: { statusCode?: number; body?: unknown } = {};
  return { capture, response: { status(code: number) { capture.statusCode = code; return this; }, json(body: unknown) { capture.body = body; return this; } } as any };
}

test('finance confirmation uses the JWT-derived tenant and actor', async () => {
  const original = CashierSessionService.confirmFinanceEntry;
  let received: unknown[] = [];
  CashierSessionService.confirmFinanceEntry = async (...args: any[]) => { received = args; return { id: 'entry-1', status: 'CONFIRMED' } as any; };
  try {
    const { capture, response } = responseCapture();
    await new CashierSessionController().confirmFinanceEntry({ restaurantId: 'tenant-a', staffId: 'manager-a', role: 'MANAGER', body: { finance_entry_id: 'entry-1' } } as any, response);
    assert.equal(capture.statusCode, undefined);
    assert.deepEqual(received, ['tenant-a', 'entry-1', 'manager-a']);
  } finally { CashierSessionService.confirmFinanceEntry = original; }
});

test('cashiers cannot confirm finance entries', async () => {
  const { capture, response } = responseCapture();
  await new CashierSessionController().confirmFinanceEntry({ restaurantId: 'tenant-a', staffId: 'cashier-a', role: 'CASHIER', body: { finance_entry_id: 'entry-1' } } as any, response);
  assert.equal(capture.statusCode, 403);
  assert.deepEqual(capture.body, { error: 'FINANCE_MANAGER_REQUIRED' });
});
