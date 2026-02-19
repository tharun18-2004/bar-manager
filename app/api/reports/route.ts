import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getWeeklyInsights } from '@/lib/gemini';
import { requireAuth } from '@/lib/api-auth';
import { badRequest, parseDateRange, rangeStartIso, serverError } from '@/lib/api-response';

// Calculate aggregated sales data with date filtering
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['manager', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const range = parseDateRange(searchParams.get('range'));
    if (!range) {
      return badRequest("range must be one of: today, week, month");
    }

    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .gte('created_at', rangeStartIso(range))
      .order('created_at', { ascending: false });

    if (error) throw error;

    const { data: inventoryData, error: inventoryError } = await supabase
      .from('inventory')
      .select('*');

    if (inventoryError) throw inventoryError;

    const insights = await getWeeklyInsights(data, inventoryData);

    return NextResponse.json({ success: true, data, insights });
  } catch (error) {
    return serverError(error);
  }
}
