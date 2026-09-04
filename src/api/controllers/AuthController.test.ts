import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthController } from './AuthController';

const response = () => {
  const result: { statusCode: number; body?: unknown } = { statusCode: 200 };
  const res = {
    status: (statusCode: number) => { result.statusCode = statusCode; return res; },
    json: (body: unknown) => { result.body = body; return res; }
  };
  return { res: res as any, result };
};

const controller = () => new AuthController({} as any, {} as any, {} as any);

test('register rejects an invalid email before persistence', async () => {
  const { res, result } = response();
  await controller().register({ body: { name: 'A', role: 'SERVER', email: 'bad', password: 'StrongPass1' }, restaurantId: 'tenant-a' } as any, res);
  assert.equal(result.statusCode, 400);
});

test('register rejects a weak password before persistence', async () => {
  const { res, result } = response();
  await controller().register({ body: { name: 'A', role: 'SERVER', email: 'a@example.com', password: 'weak' }, restaurantId: 'tenant-a' } as any, res);
  assert.equal(result.statusCode, 400);
});

test('login rejects requests without an email', async () => {
  const { res, result } = response();
  await controller().login({ body: {} } as any, res);
  assert.equal(result.statusCode, 400);
});

test('verifyEmail rejects a missing token', async () => {
  const { res, result } = response();
  await controller().verifyEmail({ body: {} } as any, res);
  assert.equal(result.statusCode, 400);
});

test('changePassword requires authenticated staff context', async () => {
  const { res, result } = response();
  await controller().changePassword({ body: {} } as any, res);
  assert.equal(result.statusCode, 401);
});

test('resetPassword rejects a missing token', async () => {
  const { res, result } = response();
  await controller().resetPassword({ body: {} } as any, res);
  assert.equal(result.statusCode, 400);
});
