'use client';

import { supabase } from '@/lib/auth';
import { AppError } from '@/lib/errors';

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
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('You must be signed in.');
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${data.session.access_token}`);
  if (!headers.has('x-request-id')) {
    headers.set('x-request-id', crypto.randomUUID());
  }

  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(input, { ...init, headers });

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    if (response.status === 401) {
      await supabase.auth.signOut();
    }
    throw new AppError(message, `HTTP_${response.status}`);
  }

  return response;
}
