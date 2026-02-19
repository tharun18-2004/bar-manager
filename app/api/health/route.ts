import { NextResponse } from 'next/server';

function hasRequiredEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function GET() {
  const envReady = hasRequiredEnv();
  const statusCode = envReady ? 200 : 503;

  return NextResponse.json(
    {
      success: envReady,
      status: envReady ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        env: envReady ? 'pass' : 'fail',
      },
    },
    { status: statusCode }
  );
}
