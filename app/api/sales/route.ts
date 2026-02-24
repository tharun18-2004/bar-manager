import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { badRequest, parseDateRange, rangeStartIso, serverError } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['staff', 'manager', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { item_name, amount, staff_name } = await req.json();
    const parsedAmount = Number(amount);

    if (!item_name || typeof item_name !== 'string' || item_name.trim().length === 0) {
      return badRequest('item_name is required');
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return badRequest('amount must be a positive number');
    }

    const { data, error } = await supabase
      .from('sales')
      .insert([
        {
          item_name: item_name.trim(),
          amount: parsedAmount,
          is_voided: false,
          staff_name: auth.user.email ?? staff_name ?? 'staff',
        },
      ])
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return serverError(error, req);
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['staff', 'manager', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const staff = searchParams.get('staff');
    const voided = searchParams.get('voided');
    const range = parseDateRange(searchParams.get('range'));

    if (searchParams.get('range') && !range) {
      return badRequest("range must be one of: today, week, month");
    }
    if (voided !== null && voided !== 'true' && voided !== 'false') {
      return badRequest('voided must be one of: true, false');
    }

    let query = supabase.from('sales').select('*');

    if (staff) query = query.eq('staff_name', staff);
    if (voided !== null) query = query.eq('is_voided', voided === 'true');
    if (range) query = query.gte('created_at', rangeStartIso(range));

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return serverError(error, req);
  }
}

