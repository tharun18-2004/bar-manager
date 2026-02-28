import { NextResponse } from 'next/server';

function normalizeEnv(value: string | undefined) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function hasRequiredEnv() {
  const url = normalizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = normalizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return Boolean(url && anon);
}

function getAppVersion() {
  return process.env.NEXT_PUBLIC_APP_VERSION || process.env.npm_package_version || 'unknown';
}

export async function GET() {
  const envReady = hasRequiredEnv();
  const supabaseUrl = normalizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = normalizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  let authReachable: boolean | null = null;
  let authError: string | null = null;

  if (envReady) {
    try {
      const authHealthUrl = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/health`;
      const response = await fetch(authHealthUrl, { method: 'GET' });
      authReachable = response.ok;
      if (!response.ok) {
        authError = `Auth health check failed with status ${response.status}`;
      }
    } catch (error) {
      authReachable = false;
      authError = error instanceof Error ? error.message : String(error);
    }
  }

  // Health readiness is based on required env configuration.
  // External auth reachability is reported in diagnostics but should not
  // flip service readiness for local/test environments.
  const statusCode = envReady ? 200 : 503;
  const now = new Date().toISOString();

  return NextResponse.json(
    {
      success: statusCode === 200,
      status: statusCode === 200 ? 'ok' : 'degraded',
      timestamp: now,
      checks: {
        env: envReady ? 'pass' : 'fail',
        supabase_auth: authReachable === null ? 'unknown' : authReachable ? 'pass' : 'fail',
      },
      diagnostics: {
        supabaseHost: (() => {
          if (!supabaseUrl) return null;
          try {
            return new URL(supabaseUrl).host;
          } catch {
            return null;
          }
        })(),
        anonKeyPrefix: supabaseAnonKey ? supabaseAnonKey.slice(0, 15) : null,
        authError,
      },
      meta: {
        version: getAppVersion(),
        nodeEnv: process.env.NODE_ENV || 'unknown',
        runtime: 'nodejs',
        uptimeSec: Math.floor(process.uptime()),
      },
    },
    { status: statusCode }
  );
}
