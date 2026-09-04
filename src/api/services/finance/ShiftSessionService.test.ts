import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBusinessDate } from './ShiftSessionService';

const boundaries = { dayStart: '11:00', dayEnd: '01:00', timezone: 'Asia/Karachi' };

test('uses the preceding business date before a midnight-spanning end boundary', () => {
  assert.equal(calculateBusinessDate(boundaries, new Date('2026-09-08T19:30:00.000Z')).toISOString().slice(0, 10), '2026-09-08');
});

test('uses the current business date after the end boundary and at day start', () => {
  assert.equal(calculateBusinessDate(boundaries, new Date('2026-09-08T20:01:00.000Z')).toISOString().slice(0, 10), '2026-09-09');
  assert.equal(calculateBusinessDate(boundaries, new Date('2026-09-09T06:00:00.000Z')).toISOString().slice(0, 10), '2026-09-09');
});

test('rejects malformed business boundaries', () => {
  assert.throws(() => calculateBusinessDate({ ...boundaries, dayStart: '25:00' }));
});
