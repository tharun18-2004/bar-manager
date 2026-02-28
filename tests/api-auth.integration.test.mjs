import test from 'node:test';
import assert from 'node:assert/strict';
import { startNextDevServer, stopNextDevServer } from './helpers/next-dev-server.mjs';

const TEST_PORT = 3200 + Math.floor(Math.random() * 2000);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let serverProcess;

test.before(async () => {
  serverProcess = await startNextDevServer(TEST_PORT, {
    AUTH_TEST_MODE: '1',
  });
});

test.after(() => {
  stopNextDevServer(serverProcess);
});

test('GET /api/sales returns 401 when Authorization header is missing', async () => {
  const response = await fetch(`${BASE_URL}/api/sales`);
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'Missing bearer token');
});

test('POST /api/inventory returns 401 when Authorization header is missing', async () => {
  const response = await fetch(`${BASE_URL}/api/inventory`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      item_name: 'Whiskey',
      category: 'Liquor',
      quantity: 10,
      unit_price: 20,
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'Missing bearer token');
});

test('GET /api/reports returns 401 for malformed bearer header', async () => {
  const response = await fetch(`${BASE_URL}/api/reports?range=week`, {
    headers: { authorization: 'Bearer' },
  });
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'Missing bearer token');
});

test('GET /api/sales returns 401 for whitespace bearer token', async () => {
  const response = await fetch(`${BASE_URL}/api/sales`, {
    headers: { authorization: 'Bearer   ' },
  });
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'Missing bearer token');
});

test('POST /api/inventory returns 403 for staff role token', async () => {
  const response = await fetch(`${BASE_URL}/api/inventory`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-staff',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      item_name: 'Vodka',
      category: 'Liquor',
      quantity: 5,
      unit_price: 18,
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'Forbidden');
});

test('GET /api/reports returns 403 for staff role token', async () => {
  const response = await fetch(`${BASE_URL}/api/reports?range=week`, {
    headers: { authorization: 'Bearer test-staff' },
  });
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'Forbidden');
});

test('POST /api/staff returns 403 for staff role token', async () => {
  const response = await fetch(`${BASE_URL}/api/staff`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-staff',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Casey',
      email: 'casey@example.test',
      password: 'secret123',
      role: 'staff',
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'Forbidden');
});

test('POST /api/inventory with staff token returns 403', async () => {
  const response = await fetch(`${BASE_URL}/api/inventory`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-staff',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      category: 'Liquor',
      quantity: 5,
      unit_price: 18,
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'Forbidden');
});

test('POST /api/staff with owner token reaches request validation', async () => {
  const response = await fetch(`${BASE_URL}/api/staff`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-owner',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Casey',
      email: 'casey@example.test',
      password: 'secret123',
      role: 'invalid-role',
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'role must be staff');
});

test('POST /api/staff with owner token validates required password', async () => {
  const response = await fetch(`${BASE_URL}/api/staff`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-owner',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Taylor',
      email: 'taylor@example.test',
      role: 'staff',
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'password must be at least 6 characters');
});

test('GET /api/reports returns 403 for staff role token', async () => {
  const response = await fetch(`${BASE_URL}/api/reports?range=week`, {
    headers: { authorization: 'Bearer test-staff' },
  });
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'Forbidden');
});

test('GET /api/sales with staff token validates voided filter', async () => {
  const response = await fetch(`${BASE_URL}/api/sales?voided=maybe`, {
    headers: { authorization: 'Bearer test-staff' },
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'voided must be one of: true, false');
});

test('GET /api/customers returns 403 for staff role token', async () => {
  const response = await fetch(`${BASE_URL}/api/customers`, {
    headers: { authorization: 'Bearer test-staff' },
  });
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'Forbidden');
});

test('POST /api/tables returns 403 for staff role token', async () => {
  const response = await fetch(`${BASE_URL}/api/tables`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-staff',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ table_number: 4, capacity: 2 }),
  });
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'Forbidden');
});

test('POST /api/sales with staff token reaches request validation', async () => {
  const response = await fetch(`${BASE_URL}/api/sales`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-staff',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ quantity: 1 }),
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'inventory_id is required');
});

test('GET /api/voids returns 403 for staff role token', async () => {
  const response = await fetch(`${BASE_URL}/api/voids`, {
    headers: { authorization: 'Bearer test-staff' },
  });
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'Forbidden');
});

test('POST /api/voids with staff token reaches request validation', async () => {
  const response = await fetch(`${BASE_URL}/api/voids`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-staff',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      void_reason: 'mistake',
      voided_amount: 25,
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'sale_id must be a positive integer');
});

test('PUT /api/staff with staff token returns 403', async () => {
  const response = await fetch(`${BASE_URL}/api/staff`, {
    method: 'PUT',
    headers: {
      authorization: 'Bearer test-staff',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      id: '11111111-1111-1111-1111-111111111111',
      role: 'staff',
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'Forbidden');
});

test('DELETE /api/staff with owner token validates UUID', async () => {
  const response = await fetch(`${BASE_URL}/api/staff?id=abc`, {
    method: 'DELETE',
    headers: { authorization: 'Bearer test-owner' },
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'id must be a valid UUID');
});

test('DELETE /api/customers with staff token is forbidden', async () => {
  const response = await fetch(`${BASE_URL}/api/customers?id=abc`, {
    method: 'DELETE',
    headers: { authorization: 'Bearer test-staff' },
  });
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'Forbidden');
});

test('PUT /api/tables with staff token reaches request validation', async () => {
  const response = await fetch(`${BASE_URL}/api/tables`, {
    method: 'PUT',
    headers: {
      authorization: 'Bearer test-staff',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      id: 1,
      status: 'broken',
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'status must be one of: available, occupied, cleaning');
});

test('GET /api/sales returns 401 for unknown bearer token', async () => {
  const response = await fetch(`${BASE_URL}/api/sales`, {
    headers: { authorization: 'Bearer definitely-not-valid' },
  });
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'Invalid or expired token');
});

test('PUT /api/staff with owner token validates id before DB', async () => {
  const response = await fetch(`${BASE_URL}/api/staff`, {
    method: 'PUT',
    headers: {
      authorization: 'Bearer test-owner',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      id: 'invalid-uuid',
      role: 'staff',
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'id must be a valid UUID');
});

test('PUT /api/customers with staff token is forbidden', async () => {
  const response = await fetch(`${BASE_URL}/api/customers`, {
    method: 'PUT',
    headers: {
      authorization: 'Bearer test-staff',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      id: 'bad-id',
      name: 'Alice',
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'Forbidden');
});

test('POST /api/customers with staff token is forbidden', async () => {
  const response = await fetch(`${BASE_URL}/api/customers`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-staff',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Alice',
      email: 'alice@example.test',
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'Forbidden');
});

test('GET /api/audit returns 403 for staff role token', async () => {
  const response = await fetch(`${BASE_URL}/api/audit`, {
    headers: { authorization: 'Bearer test-staff' },
  });
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'Forbidden');
});

test('GET /api/audit with owner token validates date_from format', async () => {
  const response = await fetch(`${BASE_URL}/api/audit?date_from=02-22-2026`, {
    headers: { authorization: 'Bearer test-owner' },
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'date_from must be YYYY-MM-DD');
});

test('GET /api/owner-analytics returns 401 when Authorization header is missing', async () => {
  const response = await fetch(`${BASE_URL}/api/owner-analytics`);
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'Missing bearer token');
});

test('GET /api/owner-analytics returns 403 for staff role token', async () => {
  const response = await fetch(`${BASE_URL}/api/owner-analytics`, {
    headers: { authorization: 'Bearer test-staff' },
  });
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'Forbidden');
});
