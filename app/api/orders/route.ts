import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { badRequest, serverError } from '@/lib/api-response';

const PAYMENT_METHODS = new Set(['cash', 'card', 'upi', 'complimentary']);

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['staff', 'manager', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { items, total, payment_method, order_id } = await req.json();
    const parsedTotal = Number(total);
    const normalizedPaymentMethod =
      typeof payment_method === 'string' && payment_method.trim().length > 0
        ? payment_method.trim().toLowerCase()
        : '';
    const normalizedOrderId =
      typeof order_id === 'string' && order_id.trim().length > 0
        ? order_id.trim()
        : `BAR-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Date.now()}`;

    if (!Array.isArray(items) || items.length === 0) {
      return badRequest('items must be a non-empty array');
    }
    if (!Number.isFinite(parsedTotal) || parsedTotal <= 0) {
      return badRequest('total must be a positive number');
    }
    if (!PAYMENT_METHODS.has(normalizedPaymentMethod)) {
      return badRequest('payment_method must be one of: cash, card, upi, complimentary');
    }

    const { data, error } = await supabase
      .from('orders')
      .insert([
        {
          order_id: normalizedOrderId,
          staff_name: auth.user.email ?? 'staff',
          total_amount: parsedTotal,
          payment_method: normalizedPaymentMethod,
          items,
          status: 'completed',
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return serverError(error, req);
  }
}
