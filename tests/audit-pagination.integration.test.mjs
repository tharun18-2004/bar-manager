import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startNextDevServer, stopNextDevServer } from './helpers/next-dev-server.mjs';

const NEXT_PORT = 5600 + Math.floor(Math.random() * 1000);
const BASE_URL = `http://127.0.0.1:${NEXT_PORT}`;

let nextServerProcess;
let mockServer;
let mockServerPort;

const auditRows = [
  {
    id: 10,
    actor_email: 'owner@example.test',
    action: 'staff.update',
    resource: 'staff',
    resource_id: '1',
    outcome: 'success',
    metadata: null,
    created_at: '2026-02-22T10:00:00.000Z',
  },
  {
    id: 9,
    actor_email: 'owner@example.test',
    action: 'staff.delete',
    resource: 'staff',
    resource_id: '2',
    outcome: 'success',
    metadata: null,
    created_at: '2026-02-22T10:00:00.000Z',
  },
  {
    id: 8,
    actor_email: 'manager@example.test',
    action: 'order.create',
    resource: 'orders',
    resource_id: 'BAR-20260222-8',
    outcome: 'success',
    metadata: null,
    created_at: '2026-02-22T09:59:59.000Z',
  },
  {
    id: 7,
    actor_email: 'manager@example.test',
    action: 'void.create',
    resource: 'sales',
    resource_id: '7',
    outcome: 'success',
    metadata: null,
    created_at: '2026-02-22T09:00:00.000Z',
  },
  {
    id: 6,
    actor_email: 'owner@example.test',
    action: 'staff.update',
    resource: 'staff',
    resource_id: '3',
    outcome: 'success',
    metadata: null,
    created_at: '2026-02-21T08:00:00.000Z',
  },
];

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function applyPostgrestFilter(rows, searchParams) {
  let result = [...rows];

  const actorFilter = searchParams.get('actor_email');
  if (actorFilter?.startsWith('ilike.')) {
    const pattern = actorFilter.slice('ilike.'.length).replaceAll('%', '').toLowerCase();
    result = result.filter((row) => (row.actor_email || '').toLowerCase().includes(pattern));
  }

  const actionFilter = searchParams.get('action');
  if (actionFilter?.startsWith('eq.')) {
    const expected = actionFilter.slice('eq.'.length);
    result = result.filter((row) => row.action === expected);
  }

  const gteCreatedAt = searchParams.get('created_at')?.startsWith('gte.')
    ? searchParams.get('created_at')?.slice('gte.'.length)
    : null;
  if (gteCreatedAt) {
    result = result.filter((row) => row.created_at >= gteCreatedAt);
  }

  const lteCreatedAt = searchParams.get('created_at')?.startsWith('lte.')
    ? searchParams.get('created_at')?.slice('lte.'.length)
    : null;
  if (lteCreatedAt) {
    result = result.filter((row) => row.created_at <= lteCreatedAt);
  }

  const orFilter = searchParams.get('or');
  if (orFilter) {
    const normalized = orFilter.startsWith('(') && orFilter.endsWith(')')
      ? orFilter.slice(1, -1)
      : orFilter;
    const match = normalized.match(
      /^created_at\.lt\.(.+),and\(created_at\.eq\.(.+),id\.lt\.(\d+)\)$/
    );
    if (match) {
      const lessThanCreatedAt = match[1];
      const equalCreatedAt = match[2];
      const lessThanId = Number(match[3]);
      result = result.filter(
        (row) =>
          row.created_at < lessThanCreatedAt ||
          (row.created_at === equalCreatedAt && row.id < lessThanId)
      );
    }
  }

  result.sort((a, b) => {
    if (a.created_at === b.created_at) return b.id - a.id;
    return a.created_at < b.created_at ? 1 : -1;
  });

  const limit = Number(searchParams.get('limit') || '0');
  if (Number.isInteger(limit) && limit > 0) {
    result = result.slice(0, limit);
  }

  return result;
}

function startMockSupabaseServer() {
  return new Promise((resolve, reject) => {
    mockServer = http.createServer(async (req, res) => {
      const reqUrl = new URL(req.url, 'http://127.0.0.1');
      if (reqUrl.pathname !== '/rest/v1/audit_logs') {
        res.writeHead(404);
        res.end();
        return;
      }

      if (req.method !== 'GET') {
        res.writeHead(405);
        res.end();
        return;
      }

      const data = applyPostgrestFilter(auditRows, reqUrl.searchParams);
      json(res, 200, data);
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

test('GET /api/audit paginates with cursor and returns non-overlapping records', async () => {
  const firstPageResponse = await fetch(`${BASE_URL}/api/audit?limit=2`, {
    headers: { authorization: 'Bearer test-owner' },
  });
  const firstPage = await firstPageResponse.json();

  assert.equal(firstPageResponse.status, 200);
  assert.equal(firstPage.success, true);
  assert.equal(firstPage.data.length, 2);
  assert.equal(firstPage.page.limit, 2);
  assert.equal(firstPage.page.hasMore, true);
  assert.equal(typeof firstPage.page.nextCursor, 'string');

  const firstIds = new Set(firstPage.data.map((row) => row.id));

  const secondPageResponse = await fetch(
    `${BASE_URL}/api/audit?limit=2&cursor=${encodeURIComponent(firstPage.page.nextCursor)}`,
    {
      headers: { authorization: 'Bearer test-owner' },
    }
  );
  const secondPage = await secondPageResponse.json();

  assert.equal(secondPageResponse.status, 200);
  assert.equal(secondPage.success, true);
  assert.equal(secondPage.data.length, 2);
  for (const row of secondPage.data) {
    assert.equal(firstIds.has(row.id), false);
  }
});

test('GET /api/audit validates invalid cursor', async () => {
  const response = await fetch(`${BASE_URL}/api/audit?cursor=not-valid-cursor`, {
    headers: { authorization: 'Bearer test-owner' },
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'cursor is invalid');
});

test('GET /api/audit validates invalid limit', async () => {
  const response = await fetch(`${BASE_URL}/api/audit?limit=500`, {
    headers: { authorization: 'Bearer test-owner' },
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'limit must be an integer between 1 and 200');
});

test('GET /api/audit supports action filter with pagination', async () => {
  const response = await fetch(`${BASE_URL}/api/audit?action=staff.update&limit=1`, {
    headers: { authorization: 'Bearer test-owner' },
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(payload.data.length, 1);
  assert.equal(payload.data[0].action, 'staff.update');
  assert.equal(payload.page.limit, 1);
  assert.equal(typeof payload.page.hasMore, 'boolean');
});
