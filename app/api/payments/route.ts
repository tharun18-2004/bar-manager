import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { badRequest, serverError } from '@/lib/api-response';
import { writeAuditEvent } from '@/lib/audit-log';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return String(error);
}

function isMissingExternalOrderIdColumnError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return message.includes('external_order_id') && message.includes('column');
}

function isMissingPaymentMethodColumnError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return message.includes('payment_method') && message.includes('column');
}

const PAYMENT_METHODS = new Set(['cash', 'card', 'upi', 'complimentary']);

type PaymentLookupRow = {
  id: number;
  order_id: string | null;
  external_order_id: string | null;
  payment_method: string | null;
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

    const { amount, orderId, staffName, items, paymentMethod } = await req.json();
    const parsedAmount = Number(amount);
    const normalizedOrderId = typeof orderId === 'string' ? orderId.trim() : '';
    const normalizedPaymentMethod =
      typeof paymentMethod === 'string' && paymentMethod.trim().length > 0
        ? paymentMethod.trim().toLowerCase()
        : 'complimentary';
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
    if (!PAYMENT_METHODS.has(normalizedPaymentMethod)) {
      return badRequest('paymentMethod must be one of: cash, card, upi, complimentary');
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
        payment_method: normalizedPaymentMethod,
        status: 'completed',
      },
    ]);

    if (insertWithExternalId.error) {
      if (
        !isMissingExternalOrderIdColumnError(insertWithExternalId.error) &&
        !isMissingPaymentMethodColumnError(insertWithExternalId.error)
      ) {
        throw insertWithExternalId.error;
      }

      // Backward-compatible fallback before migration is applied.
      const fallbackRow: Record<string, unknown> = {
        order_id: isUuid(normalizedOrderId) ? normalizedOrderId : null,
        staff_name: resolvedStaff,
        amount: parsedAmount,
        stripe_id: transactionId,
        status: 'completed',
      };

      if (!isMissingExternalOrderIdColumnError(insertWithExternalId.error)) {
        fallbackRow.external_order_id = isUuid(normalizedOrderId) ? null : normalizedOrderId;
      }

      if (!isMissingPaymentMethodColumnError(insertWithExternalId.error)) {
        fallbackRow.payment_method = normalizedPaymentMethod;
      }

      const fallbackInsert = await supabase.from('payment_transactions').insert([
        fallbackRow,
      ]);
      if (fallbackInsert.error) throw fallbackInsert.error;
    }

    await writeAuditEvent({
      req,
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      actorRole: auth.role,
      action: 'payment.create',
      resource: 'payment_transactions',
      resourceId: transactionId,
      outcome: 'success',
      metadata: {
        orderId: normalizedOrderId,
        amount: parsedAmount,
        itemsCount: items.length,
        paymentMethod: normalizedPaymentMethod,
      },
      after: {
        orderId: normalizedOrderId,
        amount: parsedAmount,
        staffName: resolvedStaff,
        paymentMethod: normalizedPaymentMethod,
        transactionId,
      },
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Free transaction completed',
      transactionId,
    });
  } catch (error) {
    return serverError(error, req);
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

    const baseSelect = 'id, order_id, external_order_id, payment_method, stripe_id, status, amount, staff_name, created_at';
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
        ? { ...fallbackByStripe.data, external_order_id: null, payment_method: null }
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
        ? { ...fallbackByStripe.data, external_order_id: null, payment_method: null }
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
    return serverError(error, req);
  }
}

