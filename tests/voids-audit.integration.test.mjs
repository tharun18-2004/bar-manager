import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startNextDevServer, stopNextDevServer } from './helpers/next-dev-server.mjs';

const NEXT_PORT = 5400 + Math.floor(Math.random() * 1000);
const BASE_URL = `http://127.0.0.1:${NEXT_PORT}`;

let nextServerProcess;
let mockServer;
let mockServerPort;

const mockState = {
  voidInserts: [],
  salesRows: [
    { id: 7, item_name: 'Whiskey', amount: 18, is_voided: false, void_reason: null },
  ],
  auditInserts: [],
};

function resetMockState() {
  mockState.voidInserts = [];
  mockState.salesRows = [
    { id: 7, item_name: 'Whiskey', amount: 18, is_voided: false, void_reason: null },
  ];
  mockState.auditInserts = [];
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
  if (!raw || !raw.startsWith('eq.')) return null;
  const parsed = Number(raw.slice(3));
  return Number.isInteger(parsed) ? parsed : null;
}

function startMockSupabaseServer() {
  return new Promise((resolve, reject) => {
    mockServer = http.createServer(async (req, res) => {
      const reqUrl = new URL(req.url, 'http://127.0.0.1');

      if (reqUrl.pathname === '/rest/v1/void_logs' && req.method === 'POST') {
        const body = await readJson(req);
        const rows = Array.isArray(body) ? body : [body];
        mockState.voidInserts.push(...rows);
        json(res, 201, []);
        return;
      }

      if (reqUrl.pathname === '/rest/v1/sales' && req.method === 'PATCH') {
        const id = parseEqId(reqUrl.searchParams);
        const body = await readJson(req);
        const rowIndex = mockState.salesRows.findIndex((row) => row.id === id);
        if (rowIndex === -1) {
          json(res, 200, []);
          return;
        }

        mockState.salesRows[rowIndex] = { ...mockState.salesRows[rowIndex], ...body };
        json(res, 200, [mockState.salesRows[rowIndex]]);
        return;
      }

      if (reqUrl.pathname === '/rest/v1/audit_logs' && req.method === 'POST') {
        const body = await readJson(req);
        const rows = Array.isArray(body) ? body : [body];
        mockState.auditInserts.push(...rows);
        json(res, 201, []);
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

test('POST /api/voids writes audit event on success', async () => {
  const response = await fetch(`${BASE_URL}/api/voids`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-manager',
      'content-type': 'application/json',
      'x-request-id': 'req-void-1',
    },
    body: JSON.stringify({
      sale_id: 7,
      void_reason: 'wrong item',
      voided_amount: 18,
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.equal(payload.success, true);
  assert.equal(mockState.voidInserts.length, 1);
  assert.equal(mockState.auditInserts.length, 1);
  assert.equal(mockState.auditInserts[0].request_id, 'req-void-1');
  assert.equal(mockState.auditInserts[0].action, 'void.create');
  assert.equal(mockState.auditInserts[0].resource, 'sales');
  assert.equal(mockState.auditInserts[0].resource_id, '7');
  assert.equal(mockState.auditInserts[0].metadata.reason, 'wrong item');
});

test('POST /api/voids validation failure does not write audit event', async () => {
  const response = await fetch(`${BASE_URL}/api/voids`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-manager',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sale_id: 0,
      void_reason: 'wrong item',
      voided_amount: 18,
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'sale_id must be a positive integer');
  assert.equal(mockState.voidInserts.length, 0);
  assert.equal(mockState.auditInserts.length, 0);
});
