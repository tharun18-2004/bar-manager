import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { badRequest, serverError } from '@/lib/api-response';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isMissingExternalOrderIdColumnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('external_order_id') && message.includes('column');
}

type PaymentLookupRow = {
  id: number;
  order_id: string | null;
  external_order_id: string | null;
  stripe_id: string | null;
  status: string | null;
  amount: number | null;
  staff_name: string | null;
  created_at: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['staff', 'manager', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { amount, orderId, staffName, items } = await req.json();
    const parsedAmount = Number(amount);
    const normalizedOrderId = typeof orderId === 'string' ? orderId.trim() : '';
    const resolvedStaff = auth.user.email ?? staffName ?? 'staff';
    const transactionId = `TXN-${Date.now()}`;

    if (!normalizedOrderId) {
      return badRequest('orderId is required');
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return badRequest('amount must be a positive number');
    }
    if (!Array.isArray(items) || items.length === 0) {
      return badRequest('items must be a non-empty array');
    }

    // Log free transaction (no Stripe processing)
    console.log('FREE TRANSACTION LOGGED:', {
      orderId: normalizedOrderId,
      staffName: resolvedStaff,
      amount: parsedAmount,
      items,
      timestamp: new Date().toISOString(),
    });

    const insertWithExternalId = await supabase.from('payment_transactions').insert([
      {
        order_id: isUuid(normalizedOrderId) ? normalizedOrderId : null,
        external_order_id: isUuid(normalizedOrderId) ? null : normalizedOrderId,
        staff_name: resolvedStaff,
        amount: parsedAmount,
        stripe_id: transactionId,
        status: 'completed',
      },
    ]);

    if (insertWithExternalId.error) {
      if (!isMissingExternalOrderIdColumnError(insertWithExternalId.error)) {
        throw insertWithExternalId.error;
      }

      // Backward-compatible fallback before migration is applied.
      const fallbackInsert = await supabase.from('payment_transactions').insert([
        {
          order_id: isUuid(normalizedOrderId) ? normalizedOrderId : null,
          staff_name: resolvedStaff,
          amount: parsedAmount,
          stripe_id: transactionId,
          status: 'completed',
        },
      ]);
      if (fallbackInsert.error) throw fallbackInsert.error;
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Free transaction completed',
      transactionId,
    });
  } catch (error) {
    return serverError(error);
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['staff', 'manager', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('orderId');

    if (!orderId || !orderId.trim()) {
      return badRequest('Missing orderId');
    }

    const normalizedOrderId = orderId.trim();

    const baseSelect = 'id, order_id, external_order_id, stripe_id, status, amount, staff_name, created_at';
    const queryByUuid = isUuid(normalizedOrderId);

    const primaryQuery = queryByUuid
      ? supabase
          .from('payment_transactions')
          .select(baseSelect)
          .eq('order_id', normalizedOrderId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : supabase
          .from('payment_transactions')
          .select(baseSelect)
          .eq('external_order_id', normalizedOrderId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

    const primaryResult = await primaryQuery;
    let data = primaryResult.data as PaymentLookupRow | null;
    let error = primaryResult.error;

    if (error && isMissingExternalOrderIdColumnError(error)) {
      const fallbackByStripe = await supabase
        .from('payment_transactions')
        .select('id, order_id, stripe_id, status, amount, staff_name, created_at')
        .eq('stripe_id', normalizedOrderId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      data = fallbackByStripe.data
        ? { ...fallbackByStripe.data, external_order_id: null }
        : null;
      error = fallbackByStripe.error;
    } else if (!queryByUuid && !data) {
      const fallbackByStripe = await supabase
        .from('payment_transactions')
        .select('id, order_id, stripe_id, status, amount, staff_name, created_at')
        .eq('stripe_id', normalizedOrderId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      data = fallbackByStripe.data
        ? { ...fallbackByStripe.data, external_order_id: null }
        : null;
      error = fallbackByStripe.error;
    }

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      status: data.status,
      message: 'Transaction found',
      data,
    });
  } catch (error) {
    return serverError(error);
  }
}
