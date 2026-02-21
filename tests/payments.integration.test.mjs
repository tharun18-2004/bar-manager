import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startNextDevServer, stopNextDevServer } from './helpers/next-dev-server.mjs';

const NEXT_PORT = 3200 + Math.floor(Math.random() * 2000);
const BASE_URL = `http://127.0.0.1:${NEXT_PORT}`;

let nextServerProcess;
let mockServer;
let mockServerPort;

const mockState = {
  inserts: [],
  insertBodies: [],
  postCount: 0,
  failInsertWithMissingColumnOnce: false,
  failInsertAlreadyUsed: false,
  queryLog: [],
};

function resetMockState() {
  mockState.inserts = [];
  mockState.insertBodies = [];
  mockState.postCount = 0;
  mockState.failInsertWithMissingColumnOnce = false;
  mockState.failInsertAlreadyUsed = false;
  mockState.queryLog = [];
}

function extractEqValue(rawValue) {
  if (!rawValue) return null;
  return rawValue.startsWith('eq.') ? rawValue.slice(3) : rawValue;
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

      if (reqUrl.pathname !== '/rest/v1/payment_transactions') {
        res.writeHead(404);
        res.end();
        return;
      }

      if (req.method === 'POST') {
        const body = await readJson(req);
        const payload = Array.isArray(body) ? body[0] : body;

        mockState.postCount += 1;
        mockState.insertBodies.push(payload);

        if (mockState.failInsertWithMissingColumnOnce && !mockState.failInsertAlreadyUsed) {
          mockState.failInsertAlreadyUsed = true;
          json(res, 400, {
            message: 'column "external_order_id" of relation "payment_transactions" does not exist',
          });
          return;
        }

        mockState.inserts.push(payload);
        json(res, 201, []);
        return;
      }

      if (req.method === 'GET') {
        const orderId = extractEqValue(reqUrl.searchParams.get('order_id'));
        const externalOrderId = extractEqValue(reqUrl.searchParams.get('external_order_id'));
        const stripeId = extractEqValue(reqUrl.searchParams.get('stripe_id'));

        mockState.queryLog.push({
          orderId,
          externalOrderId,
          stripeId,
        });

        const row = {
          id: 1,
          order_id: orderId ?? null,
          external_order_id: externalOrderId ?? null,
          stripe_id: stripeId ?? 'TXN-123',
          status: 'completed',
          amount: 100,
          staff_name: 'test-owner',
          created_at: '2026-02-16T00:00:00.000Z',
        };

        json(res, 200, row);
        return;
      }

      res.writeHead(405);
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

test('POST /api/payments stores UUID in order_id', async () => {
  const uuidOrderId = '550e8400-e29b-41d4-a716-446655440000';
  const response = await fetch(`${BASE_URL}/api/payments`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-owner',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      orderId: uuidOrderId,
      amount: 100,
      items: [{ name: 'Water', qty: 1 }],
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(mockState.inserts.length, 1);
  assert.equal(mockState.inserts[0].order_id, uuidOrderId);
  assert.equal(mockState.inserts[0].external_order_id, null);
});

test('POST /api/payments stores non-UUID in external_order_id', async () => {
  const externalOrderId = 'ORDER-123';
  const response = await fetch(`${BASE_URL}/api/payments`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-owner',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      orderId: externalOrderId,
      amount: 50,
      items: [{ name: 'Juice', qty: 1 }],
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(mockState.inserts.length, 1);
  assert.equal(mockState.inserts[0].order_id, null);
  assert.equal(mockState.inserts[0].external_order_id, externalOrderId);
});

test('GET /api/payments queries by external_order_id for non-UUID orderId', async () => {
  const externalOrderId = 'ORDER-ABC';
  const response = await fetch(`${BASE_URL}/api/payments?orderId=${encodeURIComponent(externalOrderId)}`, {
    headers: {
      authorization: 'Bearer test-staff',
    },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(payload.data.external_order_id, externalOrderId);
  assert.equal(mockState.queryLog.length, 1);
  assert.equal(mockState.queryLog[0].externalOrderId, externalOrderId);
  assert.equal(mockState.queryLog[0].orderId, null);
});

test('POST /api/payments falls back when external_order_id column is missing', async () => {
  mockState.failInsertWithMissingColumnOnce = true;

  const response = await fetch(`${BASE_URL}/api/payments`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-owner',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      orderId: 'ORDER-LEGACY',
      amount: 75,
      items: [{ name: 'Soda', qty: 1 }],
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(mockState.postCount, 2);
  assert.equal(mockState.insertBodies[0].external_order_id, 'ORDER-LEGACY');
  assert.equal(mockState.inserts.length, 1);
  assert.equal(Object.hasOwn(mockState.inserts[0], 'external_order_id'), false);
  assert.equal(mockState.inserts[0].order_id, null);
});
