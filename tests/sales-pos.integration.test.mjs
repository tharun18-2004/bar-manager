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
  rpcCalls: [],
  inventoryRows: [
    {
      id: '11111111-1111-1111-1111-111111111111',
      item_name: 'Beer Pint',
      current_stock_ml: 5000,
    },
  ],
  inventorySizes: [
    {
      id: '22222222-2222-2222-2222-222222222222',
      inventory_id: '11111111-1111-1111-1111-111111111111',
      size_ml: 60,
      selling_price: 6,
      is_active: true,
    },
  ],
};

function resetMockState() {
  mockState.rpcCalls = [];
  mockState.inventoryRows = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      item_name: 'Beer Pint',
      current_stock_ml: 5000,
    },
  ];
  mockState.inventorySizes = [
    {
      id: '22222222-2222-2222-2222-222222222222',
      inventory_id: '11111111-1111-1111-1111-111111111111',
      size_ml: 60,
      selling_price: 6,
      is_active: true,
    },
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

async function fetchWithTimeout(url, options = {}, timeoutMs = 45000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function startMockSupabaseServer() {
  return new Promise((resolve, reject) => {
    mockServer = http.createServer(async (req, res) => {
      const reqUrl = new URL(req.url, 'http://127.0.0.1');

      if (reqUrl.pathname === '/rest/v1/rpc/create_sale_with_stock' && req.method === 'POST') {
        const body = await readJson(req);
        mockState.rpcCalls.push(body);

        const inventory = mockState.inventoryRows.find((row) => row.id === body?.p_inventory_id);
        const size = mockState.inventorySizes.find(
          (row) => row.id === body?.p_inventory_size_id && row.inventory_id === body?.p_inventory_id
        );

        if (!inventory || !size || !size.is_active) {
          json(res, 400, { message: 'inventory size not found or inactive' });
          return;
        }

        const quantity = Number(body?.p_quantity ?? 0);
        if (!Number.isInteger(quantity) || quantity <= 0) {
          json(res, 400, { message: 'quantity must be > 0' });
          return;
        }

        const requiredMl = quantity * size.size_ml;
        if (inventory.current_stock_ml < requiredMl) {
          json(res, 400, { message: 'insufficient stock' });
          return;
        }

        inventory.current_stock_ml -= requiredMl;

        json(res, 200, {
          sale_id: 'sale-1',
          item_name: inventory.item_name,
          size_ml: size.size_ml,
          quantity,
          unit_price: size.selling_price,
          line_total: size.selling_price * quantity,
          remaining_stock_ml: inventory.current_stock_ml,
        });
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
  const response = await fetchWithTimeout(`${BASE_URL}/api/sales`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-staff',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      inventory_id: '11111111-1111-1111-1111-111111111111',
      inventory_size_id: '22222222-2222-2222-2222-222222222222',
      quantity: 1,
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.equal(payload.success, true);
  assert.equal(typeof payload.data, 'object');
  assert.equal(payload.data.item_name, 'Beer Pint');
  assert.equal(payload.data.quantity, 1);
  assert.equal(payload.data.unit_price, 6);
  assert.equal(payload.data.remaining_stock_ml, 4940);
  assert.equal(mockState.rpcCalls.length, 1);
  assert.equal(mockState.rpcCalls[0].p_staff_name, 'staff@example.test');
});
