import test from 'node:test';
import assert from 'node:assert/strict';
import { startNextDevServer, stopNextDevServer } from './helpers/next-dev-server.mjs';

const TEST_PORT = 5200 + Math.floor(Math.random() * 2000);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let serverProcess;

test.before(async () => {
  serverProcess = await startNextDevServer(TEST_PORT, {
    NEXT_PUBLIC_AUTH_TEST_MODE: '1',
    AUTH_TEST_MODE: undefined,
  });
});

test.after(() => {
  stopNextDevServer(serverProcess);
});

test('GET /api/sales rejects test token when only NEXT_PUBLIC_AUTH_TEST_MODE is enabled', async () => {
  const response = await fetch(`${BASE_URL}/api/sales`, {
    headers: { authorization: 'Bearer test-owner' },
  });
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'Invalid or expired token');
});

test('GET /api/reports rejects test-manager token when only NEXT_PUBLIC_AUTH_TEST_MODE is enabled', async () => {
  const response = await fetch(`${BASE_URL}/api/reports?range=week`, {
    headers: { authorization: 'Bearer test-manager' },
  });
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'Invalid or expired token');
});

test('POST /api/inventory rejects test-staff token when only NEXT_PUBLIC_AUTH_TEST_MODE is enabled', async () => {
  const response = await fetch(`${BASE_URL}/api/inventory`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-staff',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      item_name: 'Rum',
      category: 'Liquor',
      quantity: 8,
      unit_price: 21,
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'Invalid or expired token');
});
