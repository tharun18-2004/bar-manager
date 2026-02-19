import test from 'node:test';
import assert from 'node:assert/strict';
import { startNextDevServer, stopNextDevServer } from './helpers/next-dev-server.mjs';

const TEST_PORT = 7400 + Math.floor(Math.random() * 1000);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let serverProcess;

test.before(async () => {
  serverProcess = await startNextDevServer(TEST_PORT);
});

test.after(() => {
  stopNextDevServer(serverProcess);
});

test('GET /api/health returns 200 with ready env checks', async () => {
  const response = await fetch(`${BASE_URL}/api/health`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(payload.status, 'ok');
  assert.equal(payload.checks?.env, 'pass');
  assert.equal(typeof payload.timestamp, 'string');
  assert.ok(payload.timestamp.length > 0);
});
