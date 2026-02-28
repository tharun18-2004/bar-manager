import { createClient } from '@supabase/supabase-js';

function normalizeEnv(value: string | undefined) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const supabaseUrl = normalizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceRoleKey = normalizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

export function getSupabaseAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('Supabase admin client is server-only.');
  }
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      'Missing Supabase admin configuration. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
