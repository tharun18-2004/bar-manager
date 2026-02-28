import { supabase } from '@/lib/supabase';

export async function getLatestMonthClosureCutoffIso(): Promise<string | null> {
  const { data, error } = await supabase
    .from('month_closures')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Allow environments where migration has not yet been applied.
    if (message.includes('month_closures') && message.includes('does not exist')) {
      return null;
    }
    throw error;
  }

  const createdAt = data?.[0]?.created_at;
  return typeof createdAt === 'string' && createdAt.trim().length > 0 ? createdAt : null;
}

export function maxIso(a: string, b: string) {
  return a > b ? a : b;
}
