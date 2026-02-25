import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { badRequest, serverError } from '@/lib/api-response';
import { writeAuditEvent } from '@/lib/audit-log';

const PAYMENT_METHODS = new Set(['CASH', 'CARD', 'UPI', 'COMPLIMENTARY']);
type OrderRecord = {
  id?: string | number;
  order_id?: string;
  total_amount?: number | string;
  payment_method?: string | null;
  [key: string]: unknown;
};
function isMissingCreatedByColumnError(error: unknown): boolean {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');
  return message.includes("Could not find the 'created_by' column");
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['staff', 'manager', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { items, total, payment_method, paymentMethod, order_id } = await req.json();
    const parsedTotal = Number(total);
    const rawPaymentMethod =
      typeof payment_method === 'string' && payment_method.trim().length > 0
        ? payment_method
        : paymentMethod;
    const normalizedPaymentMethod =
      typeof rawPaymentMethod === 'string' && rawPaymentMethod.trim().length > 0
        ? rawPaymentMethod.trim().toUpperCase()
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
      return badRequest('payment_method must be one of: CASH, CARD, UPI, COMPLIMENTARY');
    }

    const payloadWithCreator = {
      order_id: normalizedOrderId,
      staff_name: auth.user.email ?? 'staff',
      created_by: auth.user.id,
      total_amount: parsedTotal,
      payment_method: normalizedPaymentMethod,
      items,
      status: 'completed',
    };
    const payloadWithoutCreator = {
      order_id: normalizedOrderId,
      staff_name: auth.user.email ?? 'staff',
      total_amount: parsedTotal,
      payment_method: normalizedPaymentMethod,
      items,
      status: 'completed',
    };

    let orderData: OrderRecord | null = null;
    const withCreatorResult = await supabase
      .from('orders')
      .insert([payloadWithCreator])
      .select()
      .single();

    if (withCreatorResult.error) {
      if (!isMissingCreatedByColumnError(withCreatorResult.error)) {
        throw withCreatorResult.error;
      }

      const fallbackResult = await supabase
        .from('orders')
        .insert([payloadWithoutCreator])
        .select()
        .single();

      if (fallbackResult.error) throw fallbackResult.error;
      orderData = fallbackResult.data;
    } else {
      orderData = withCreatorResult.data;
    }

    await writeAuditEvent({
      req,
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      actorRole: auth.role,
      action: 'order.create',
      resource: 'orders',
      resourceId: orderData?.id ?? orderData?.order_id ?? null,
      metadata: {
        order_id: orderData?.order_id ?? null,
        total_amount: orderData?.total_amount ?? null,
        payment_method: orderData?.payment_method ?? null,
      },
      after: orderData,
    });

    return NextResponse.json({ success: true, data: orderData }, { status: 201 });
  } catch (error) {
    return serverError(error, req);
  }
}
