import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startNextDevServer, stopNextDevServer } from './helpers/next-dev-server.mjs';

const NEXT_PORT = 5200 + Math.floor(Math.random() * 1000);
const BASE_URL = `http://127.0.0.1:${NEXT_PORT}`;

let nextServerProcess;
let mockServer;
let mockServerPort;

const mockState = {
  auditInserts: [],
  staffRows: [
    { id: 1, name: 'Alex', email: 'alex@example.test', role: 'manager' },
    { id: 2, name: 'Casey', email: 'casey@example.test', role: 'bartender' },
  ],
};

function resetMockState() {
  mockState.auditInserts = [];
  mockState.staffRows = [
    { id: 1, name: 'Alex', email: 'alex@example.test', role: 'manager' },
    { id: 2, name: 'Casey', email: 'casey@example.test', role: 'bartender' },
  ];
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : null;
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function parseEqId(searchParams) {
  const raw = searchParams.get('id');
  if (!raw) return null;
  if (!raw.startsWith('eq.')) return null;
  const parsed = Number(raw.slice(3));
  return Number.isInteger(parsed) ? parsed : null;
}

function startMockSupabaseServer() {
  return new Promise((resolve, reject) => {
    mockServer = http.createServer(async (req, res) => {
      const reqUrl = new URL(req.url, 'http://127.0.0.1');

      if (reqUrl.pathname === '/rest/v1/audit_logs' && req.method === 'POST') {
        const body = await readJson(req);
        const rows = Array.isArray(body) ? body : [body];
        mockState.auditInserts.push(...rows);
        json(res, 201, []);
        return;
      }

      if (reqUrl.pathname === '/rest/v1/staff' && req.method === 'GET') {
        const id = parseEqId(reqUrl.searchParams);
        const rows = id ? mockState.staffRows.filter((row) => row.id === id) : mockState.staffRows;
        json(res, 200, rows);
        return;
      }

      if (reqUrl.pathname === '/rest/v1/staff' && req.method === 'PATCH') {
        const id = parseEqId(reqUrl.searchParams);
        const body = await readJson(req);
        const rowIndex = mockState.staffRows.findIndex((row) => row.id === id);
        if (rowIndex === -1) {
          json(res, 200, []);
          return;
        }

        mockState.staffRows[rowIndex] = { ...mockState.staffRows[rowIndex], ...body };
        json(res, 200, [mockState.staffRows[rowIndex]]);
        return;
      }

      if (reqUrl.pathname === '/rest/v1/staff' && req.method === 'DELETE') {
        const id = parseEqId(reqUrl.searchParams);
        const rowIndex = mockState.staffRows.findIndex((row) => row.id === id);
        if (rowIndex !== -1) {
          mockState.staffRows.splice(rowIndex, 1);
        }
        json(res, 200, []);
        return;
      }

      res.writeHead(404);
      res.end();
    });

    mockServer.once('error', reject);
    mockServer.listen(0, '127.0.0.1', () => {
      mockServerPort = mockServer.address().port;
      resolve();
    });
  });
}

test.before(async () => {
  await startMockSupabaseServer();
  nextServerProcess = await startNextDevServer(NEXT_PORT, {
    AUTH_TEST_MODE: '1',
    AUDIT_LOG_TO_DB: '1',
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${mockServerPort}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
  });
});

test.after(() => {
  stopNextDevServer(nextServerProcess);
  if (mockServer) {
    mockServer.close();
  }
});

test.beforeEach(() => {
  resetMockState();
});

test('PUT /api/staff writes staff.update audit event on success', async () => {
  const response = await fetch(`${BASE_URL}/api/staff`, {
    method: 'PUT',
    headers: {
      authorization: 'Bearer test-owner',
      'content-type': 'application/json',
      'x-request-id': 'req-staff-put-1',
    },
    body: JSON.stringify({
      id: 1,
      role: 'waiter',
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(mockState.auditInserts.length, 1);

  const event = mockState.auditInserts[0];
  assert.equal(event.request_id, 'req-staff-put-1');
  assert.equal(event.action, 'staff.update');
  assert.equal(event.resource, 'staff');
  assert.equal(event.resource_id, '1');
  assert.equal(event.actor_role, 'owner');
  assert.equal(event.outcome, 'success');
  assert.equal(event.before_state.role, 'manager');
  assert.equal(event.after_state.role, 'waiter');
  assert.deepEqual(event.metadata.updatedFields, ['role']);
});

test('DELETE /api/staff writes staff.delete audit event on success', async () => {
  const response = await fetch(`${BASE_URL}/api/staff?id=2`, {
    method: 'DELETE',
    headers: {
      authorization: 'Bearer test-owner',
      'x-request-id': 'req-staff-del-1',
    },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(mockState.auditInserts.length, 1);

  const event = mockState.auditInserts[0];
  assert.equal(event.request_id, 'req-staff-del-1');
  assert.equal(event.action, 'staff.delete');
  assert.equal(event.resource, 'staff');
  assert.equal(event.resource_id, '2');
  assert.equal(event.outcome, 'success');
  assert.equal(event.before_state.email, 'casey@example.test');
  assert.equal(event.after_state, null);
});

test('PUT /api/staff validation failure does not write audit event', async () => {
  const response = await fetch(`${BASE_URL}/api/staff`, {
    method: 'PUT',
    headers: {
      authorization: 'Bearer test-owner',
      'content-type': 'application/json',
      'x-request-id': 'req-staff-put-invalid',
    },
    body: JSON.stringify({
      id: 0,
      role: 'waiter',
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'id must be a positive integer');
  assert.equal(mockState.auditInserts.length, 0);
});
