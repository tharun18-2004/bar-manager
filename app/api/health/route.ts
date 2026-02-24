import { NextResponse } from 'next/server';

function hasRequiredEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function getAppVersion() {
  return process.env.NEXT_PUBLIC_APP_VERSION || process.env.npm_package_version || 'unknown';
}

export async function GET() {
  const envReady = hasRequiredEnv();
  const statusCode = envReady ? 200 : 503;
  const now = new Date().toISOString();

  return NextResponse.json(
    {
      success: envReady,
      status: envReady ? 'ok' : 'degraded',
      timestamp: now,
      checks: {
        env: envReady ? 'pass' : 'fail',
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
