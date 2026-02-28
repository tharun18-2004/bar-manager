import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { badRequest, serverError } from '@/lib/api-response';
import { supabase } from '@/lib/supabase';
import { writeAuditEvent } from '@/lib/audit-log';

type PaymentBreakdown = {
  totalSales: number;
  cashExpected: number;
  cardExpected: number;
  upiExpected: number;
  complimentaryAmount: number;
};

function parseTimezoneOffset(raw: unknown) {
  const parsed = Number(raw ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-840, Math.min(840, Math.trunc(parsed)));
}

function getShiftStartFromTimezoneOffset(timezoneOffsetMinutes: number) {
  const now = new Date();
  const localLike = new Date(now.getTime() - timezoneOffsetMinutes * 60_000);
  const y = localLike.getUTCFullYear();
  const m = localLike.getUTCMonth();
  const d = localLike.getUTCDate();
  const localMidnightAsUtcMs = Date.UTC(y, m, d, 0, 0, 0, 0);
  return new Date(localMidnightAsUtcMs + timezoneOffsetMinutes * 60_000).toISOString();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return String(error ?? '');
}

function isRelationMissingError(error: unknown, relation: string) {
  const message = getErrorMessage(error);
  return message.includes(relation) && message.includes('does not exist');
}

function aggregateOrdersByPaymentMethod(rows: Array<{ total_amount: number | string; payment_method: string | null }>): PaymentBreakdown {
  let totalSales = 0;
  let cashExpected = 0;
  let cardExpected = 0;
  let upiExpected = 0;
  let complimentaryAmount = 0;

  rows.forEach((row) => {
    const amount = Number(row.total_amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return;
    totalSales += amount;
    const method = String(row.payment_method ?? '').toUpperCase();
    if (method === 'CASH') cashExpected += amount;
    else if (method === 'CARD') cardExpected += amount;
    else if (method === 'UPI') upiExpected += amount;
    else if (method === 'COMPLIMENTARY') complimentaryAmount += amount;
  });

  return {
    totalSales: Number(totalSales.toFixed(2)),
    cashExpected: Number(cashExpected.toFixed(2)),
    cardExpected: Number(cardExpected.toFixed(2)),
    upiExpected: Number(upiExpected.toFixed(2)),
    complimentaryAmount: Number(complimentaryAmount.toFixed(2)),
  };
}

async function resolveShiftStartIso(userId: string, timezoneOffsetMinutes: number) {
  const fallbackStart = getShiftStartFromTimezoneOffset(timezoneOffsetMinutes);
  const { data, error } = await supabase
    .from('shift_logs')
    .select('shift_end')
    .eq('staff_id', userId)
    .order('shift_end', { ascending: false })
    .limit(1);
  if (error) {
    if (isRelationMissingError(error, 'shift_logs')) {
      return { shiftStartIso: fallbackStart, missingTable: true };
    }
    throw error;
  }

  const lastShiftEnd = data?.[0]?.shift_end;
  const shiftStartIso = typeof lastShiftEnd === 'string' && lastShiftEnd.length > 0 ? lastShiftEnd : fallbackStart;
  return { shiftStartIso, missingTable: false };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['staff', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const timezoneOffsetMinutes = parseTimezoneOffset(searchParams.get('tz_offset'));

    const { shiftStartIso, missingTable } = await resolveShiftStartIso(auth.user.id, timezoneOffsetMinutes);
    if (missingTable) {
      return badRequest('shift_logs table is missing. Run shift log migration first.');
    }

    const shiftEndIso = new Date().toISOString();
    const { data: ordersRows, error: ordersError } = await supabase
      .from('orders')
      .select('total_amount, payment_method')
      .gte('created_at', shiftStartIso)
      .lte('created_at', shiftEndIso)
      .order('created_at', { ascending: true });
    if (ordersError) throw ordersError;

    const breakdown = aggregateOrdersByPaymentMethod(
      (ordersRows ?? []) as Array<{ total_amount: number | string; payment_method: string | null }>
    );

    return NextResponse.json({
      success: true,
      data: {
        shift_start: shiftStartIso,
        shift_end: shiftEndIso,
        ...breakdown,
      },
    });
  } catch (error) {
    return serverError(error, req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['staff', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json().catch(() => ({}));
    const timezoneOffsetMinutes = parseTimezoneOffset(body?.tz_offset);
    const cashCounted = Number(body?.cash_counted);
    if (!Number.isFinite(cashCounted) || cashCounted < 0) {
      return badRequest('cash_counted must be a non-negative number');
    }

    const { shiftStartIso, missingTable } = await resolveShiftStartIso(auth.user.id, timezoneOffsetMinutes);
    if (missingTable) {
      return badRequest('shift_logs table is missing. Run shift log migration first.');
    }
    const shiftEndIso = new Date().toISOString();

    const { data: ordersRows, error: ordersError } = await supabase
      .from('orders')
      .select('total_amount, payment_method')
      .gte('created_at', shiftStartIso)
      .lte('created_at', shiftEndIso)
      .order('created_at', { ascending: true });
    if (ordersError) throw ordersError;

    const breakdown = aggregateOrdersByPaymentMethod(
      (ordersRows ?? []) as Array<{ total_amount: number | string; payment_method: string | null }>
    );
    const difference = Number((cashCounted - breakdown.cashExpected).toFixed(2));

    const shiftPayload = {
      staff_id: auth.user.id,
      staff_email: auth.user.email ?? null,
      shift_start: shiftStartIso,
      shift_end: shiftEndIso,
      total_sales: breakdown.totalSales,
      cash_expected: breakdown.cashExpected,
      card_expected: breakdown.cardExpected,
      upi_expected: breakdown.upiExpected,
      complimentary_amount: breakdown.complimentaryAmount,
      cash_counted: Number(cashCounted.toFixed(2)),
      difference,
      metadata: {
        timezone_offset_minutes: timezoneOffsetMinutes,
      },
    };

    const { data: insertedRow, error: insertError } = await supabase
      .from('shift_logs')
      .insert([shiftPayload])
      .select()
      .single();
    if (insertError) throw insertError;

    await writeAuditEvent({
      req,
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      actorRole: auth.role,
      action: 'shift.close',
      resource: 'shift_logs',
      resourceId: insertedRow?.id ?? null,
      metadata: {
        total_sales: breakdown.totalSales,
        cash_expected: breakdown.cashExpected,
        cash_counted: Number(cashCounted.toFixed(2)),
        difference,
      },
      after: insertedRow,
    });

    return NextResponse.json({
      success: true,
      data: insertedRow,
      message: 'Shift closed successfully.',
    });
  } catch (error) {
    return serverError(error, req);
  }
}

