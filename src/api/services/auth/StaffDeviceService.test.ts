import assert from 'node:assert/strict';
import test from 'node:test';
import { StaffDeviceService } from './StaffDeviceService';

test('accepts only SHA-256-shaped device fingerprints', () => {
  const fingerprint = 'a'.repeat(64);
  assert.deepEqual(StaffDeviceService.normalize({ fingerprint, name: 'Terminal' }), { fingerprint, name: 'Terminal' });
  assert.equal(StaffDeviceService.normalize({ fingerprint: 'not-a-fingerprint' }), null);
});

test('trims device names and does not retain blank values', () => {
  const fingerprint = 'b'.repeat(64);
  assert.deepEqual(StaffDeviceService.normalize({ fingerprint, name: '  ' }), { fingerprint, name: undefined });
});
