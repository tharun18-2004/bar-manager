import { createClient, SupabaseClient } from '@supabase/supabase-js';

function normalizeEnv(value: string | undefined) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const supabaseUrl = normalizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = normalizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const supabaseServiceRoleKey = normalizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
const isServer = typeof window === 'undefined';
const resolvedKey = isServer ? (supabaseServiceRoleKey ?? supabaseAnonKey) : supabaseAnonKey;
const hasSupabaseConfig = Boolean(supabaseUrl && resolvedKey);

const baseClient = createClient<any>(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  resolvedKey ?? 'placeholder-anon-key'
);

function assertSupabaseConfig() {
  if (!hasSupabaseConfig) {
    throw new Error(
      'Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY for server routes.'
    );
  }
}

export function getSupabaseClient(): SupabaseClient<any> {
  assertSupabaseConfig();
  return baseClient;
}

export const supabase: SupabaseClient<any> = new Proxy(baseClient, {
  get(target, prop, receiver) {
    assertSupabaseConfig();
    const value = Reflect.get(target, prop, receiver);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});
