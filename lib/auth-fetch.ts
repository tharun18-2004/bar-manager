'use client';

import { supabase } from '@/lib/auth';
import { AppError } from '@/lib/errors';

const TOKEN_CACHE_TTL_MS = 10_000;
const TOKEN_EXPIRY_SAFETY_MS = 30_000;
let cachedAccessToken: string | null = null;
let cachedTokenExpiryMs = 0;
let cachedAtMs = 0;
let inFlightTokenPromise: Promise<string> | null = null;

function setTokenCache(accessToken: string, expiresAtSeconds?: number | null) {
  const now = Date.now();
  cachedAccessToken = accessToken;
  cachedAtMs = now;
  cachedTokenExpiryMs =
    typeof expiresAtSeconds === 'number' && Number.isFinite(expiresAtSeconds)
      ? expiresAtSeconds * 1000
      : now + 60_000;
}

function clearTokenCache() {
  cachedAccessToken = null;
  cachedTokenExpiryMs = 0;
  cachedAtMs = 0;
}

function getCachedToken() {
  const now = Date.now();
  const isStaleByTime = now - cachedAtMs > TOKEN_CACHE_TTL_MS;
  const isNearExpiry = now >= cachedTokenExpiryMs - TOKEN_EXPIRY_SAFETY_MS;
  if (!cachedAccessToken || isStaleByTime || isNearExpiry) return null;
  return cachedAccessToken;
}

async function extractErrorMessage(response: Response): Promise<string> {
  const fallback = `Request failed with status ${response.status}`;

  try {
    const payload = await response.json();
    if (payload && typeof payload.error === 'string' && payload.error.trim().length > 0) {
      const requestId =
        typeof payload.requestId === 'string' && payload.requestId.trim().length > 0
          ? payload.requestId
          : null;
      return requestId ? `${payload.error} (requestId: ${requestId})` : payload.error;
    }

    if (payload && payload.error && typeof payload.error === 'object') {
      const nestedMessage =
        typeof payload.error.message === 'string' && payload.error.message.trim().length > 0
          ? payload.error.message
          : JSON.stringify(payload.error);
      const requestId =
        typeof payload.requestId === 'string' && payload.requestId.trim().length > 0
          ? payload.requestId
          : null;
      return requestId ? `${nestedMessage} (requestId: ${requestId})` : nestedMessage;
    }

    return fallback;
  } catch {
    return fallback;
  }
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const getAccessToken = async () => {
    const cached = getCachedToken();
    if (cached) return cached;
    if (inFlightTokenPromise) return inFlightTokenPromise;

    inFlightTokenPromise = (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!error && data.session?.access_token) {
        setTokenCache(data.session.access_token, data.session.expires_at);
        return data.session.access_token;
      }

      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshed.session?.access_token) {
        clearTokenCache();
        throw new Error('You must be signed in.');
      }

      setTokenCache(refreshed.session.access_token, refreshed.session.expires_at);
      return refreshed.session.access_token;
    })();

    try {
      return await inFlightTokenPromise;
    } finally {
      inFlightTokenPromise = null;
    }
  };

  const send = async (accessToken: string) => {
    const headers = new Headers(init.headers);
    const method = String(init.method ?? 'GET').toUpperCase();
    headers.set('Authorization', `Bearer ${accessToken}`);
    if (!headers.has('x-request-id')) {
      headers.set('x-request-id', crypto.randomUUID());
    }

    if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const requestInit: RequestInit = { ...init, headers };
    if ((method === 'GET' || method === 'HEAD') && requestInit.cache === undefined) {
      requestInit.cache = 'no-store';
    }

    return fetch(input, requestInit);
  };

  const initialToken = await getAccessToken();
  let response = await send(initialToken);

  if (!response.ok) {
    if (response.status === 401) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshed.session?.access_token) {
        setTokenCache(refreshed.session.access_token, refreshed.session.expires_at);
        response = await send(refreshed.session.access_token);
      }
    }
  }

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    if (response.status === 401) {
      clearTokenCache();
      await supabase.auth.signOut();
    }
    throw new AppError(message, `HTTP_${response.status}`);
  }

  return response;
}
