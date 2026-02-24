import test from 'node:test';
import assert from 'node:assert/strict';
import { startNextDevServer, stopNextDevServer } from './helpers/next-dev-server.mjs';

const TEST_PORT = 7600 + Math.floor(Math.random() * 1000);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let serverProcess;

test.before(async () => {
  serverProcess = await startNextDevServer(TEST_PORT, {
    NEXT_PUBLIC_SUPABASE_URL: null,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: null,
  });
});

test.after(() => {
  stopNextDevServer(serverProcess);
});

test('GET /api/health returns 503 when required env is missing', async () => {
  const response = await fetch(`${BASE_URL}/api/health`);
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.equal(payload.success, false);
  assert.equal(payload.status, 'degraded');
  assert.equal(payload.checks?.env, 'fail');
  assert.equal(typeof payload.timestamp, 'string');
  assert.ok(payload.timestamp.length > 0);
  assert.equal(typeof payload.meta?.version, 'string');
  assert.ok(payload.meta.version.length > 0);
  assert.equal(payload.meta?.runtime, 'nodejs');
  assert.equal(typeof payload.meta?.nodeEnv, 'string');
  assert.equal(typeof payload.meta?.uptimeSec, 'number');
  assert.ok(payload.meta.uptimeSec >= 0);
});
