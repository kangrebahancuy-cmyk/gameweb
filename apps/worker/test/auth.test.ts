import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AuthError, verifyToken } from '../src/auth';
import type { Env } from '../src/env';

const env = (o: Partial<Env>) => o as Env;
const ID = '123e4567-e89b-12d3-a456-426614174000';

test('dev guest token is accepted only when DEV_AUTH=true', async () => {
  const ok = await verifyToken(`dev.${ID}`, env({ DEV_AUTH: 'true' }));
  assert.equal(ok.sub, ID);
  await assert.rejects(() => verifyToken(`dev.${ID}`, env({ DEV_AUTH: 'false' })), (e: unknown) => e instanceof AuthError && e.kind === 'config');
});

test('malformed dev token is invalid', async () => {
  await assert.rejects(() => verifyToken('dev.not-a-uuid', env({ DEV_AUTH: 'true' })), (e: unknown) => e instanceof AuthError && e.kind === 'invalid');
});

test('real token without SUPABASE_URL reports a configuration problem', async () => {
  await assert.rejects(() => verifyToken('a.b.c', env({})), (e: unknown) => e instanceof AuthError && e.kind === 'config');
});

test('garbage token with SUPABASE_URL is invalid', async () => {
  await assert.rejects(() => verifyToken('garbage', env({ SUPABASE_URL: 'https://x.supabase.co' })), (e: unknown) => e instanceof AuthError && e.kind === 'invalid');
});
