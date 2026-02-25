import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startNextDevServer, stopNextDevServer } from './helpers/next-dev-server.mjs';

const NEXT_PORT = 5600 + Math.floor(Math.random() * 1000);
const BASE_URL = `http://127.0.0.1:${NEXT_PORT}`;

let nextServerProcess;
let mockServer;
let mockServerPort;

const mockState = {
  salesInserts: [],
  inventoryRows: [{ id: 10, item_name: 'Beer Pint', quantity: 50 }],
  inventoryUpdates: [],
};

function resetMockState() {
  mockState.salesInserts = [];
  mockState.inventoryRows = [{ id: 10, item_name: 'Beer Pint', quantity: 50 }];
  mockState.inventoryUpdates = [];
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

function startMockSupabaseServer() {
  return new Promise((resolve, reject) => {
    mockServer = http.createServer(async (req, res) => {
      const reqUrl = new URL(req.url, 'http://127.0.0.1');

      if (reqUrl.pathname === '/rest/v1/sales' && req.method === 'POST') {
        const body = await readJson(req);
        const rows = Array.isArray(body) ? body : [body];
        const inserted = rows.map((row, index) => ({
          id: index + 1,
          created_at: '2026-02-25T00:00:00.000Z',
          ...row,
        }));
        mockState.salesInserts.push(...inserted);
        json(res, 201, inserted);
        return;
      }

      if (reqUrl.pathname === '/rest/v1/inventory' && req.method === 'GET') {
        const itemNameFilter = reqUrl.searchParams.get('item_name');
        const itemName = itemNameFilter && itemNameFilter.startsWith('eq.') ? itemNameFilter.slice(3) : null;
        const rows = itemName
          ? mockState.inventoryRows.filter((row) => row.item_name === itemName)
          : mockState.inventoryRows;
        json(res, 200, rows.slice(0, 1));
        return;
      }

      if (reqUrl.pathname === '/rest/v1/inventory' && req.method === 'PATCH') {
        const body = await readJson(req);
        const idFilter = reqUrl.searchParams.get('id');
        const id = idFilter && idFilter.startsWith('eq.') ? Number(idFilter.slice(3)) : NaN;
        const rowIndex = mockState.inventoryRows.findIndex((row) => row.id === id);
        if (rowIndex >= 0) {
          mockState.inventoryRows[rowIndex] = { ...mockState.inventoryRows[rowIndex], ...body };
          mockState.inventoryUpdates.push(mockState.inventoryRows[rowIndex]);
          json(res, 200, [mockState.inventoryRows[rowIndex]]);
          return;
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

test('POST /api/sales with staff token creates sales row for POS completion', async () => {
  const response = await fetch(`${BASE_URL}/api/sales`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-staff',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      item_name: 'Beer Pint',
      amount: 6,
      quantity: 1,
      staff_name: 'Manual Override',
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.equal(payload.success, true);
  assert.equal(Array.isArray(payload.data), true);
  assert.equal(payload.data.length, 1);
  assert.equal(mockState.salesInserts.length, 1);
  assert.equal(mockState.salesInserts[0].item_name, 'Beer Pint');
  assert.equal(mockState.salesInserts[0].amount, 6);
  assert.equal(mockState.salesInserts[0].is_voided, false);
  assert.equal(mockState.salesInserts[0].staff_name, 'staff@example.test');
  assert.equal(mockState.inventoryUpdates.length, 1);
  assert.equal(mockState.inventoryUpdates[0].quantity, 49);
});
