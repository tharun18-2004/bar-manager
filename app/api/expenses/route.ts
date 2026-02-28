import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { badRequest, serverError } from '@/lib/api-response';
import { writeAuditEvent } from '@/lib/audit-log';

function expensesTableMissingResponse() {
  return NextResponse.json(
    {
      success: false,
      error:
        "Database table public.expenses is missing. Run db/migrations/2026-02-28_add_inventory_profit_and_expenses.sql.",
    },
    { status: 500 }
  );
}

function isExpensesMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = 'message' in error && typeof error.message === 'string' ? error.message.toLowerCase() : '';
  return message.includes("could not find the table 'public.expenses'") || message.includes("relation 'public.expenses' does not exist") || message.includes('relation "public.expenses" does not exist');
}

function normalizeDate(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  return value;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['owner']);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const date = normalizeDate(searchParams.get('date'));

    let query = supabase
      .from('expenses')
      .select('id, date, type, amount, created_at')
      .order('date', { ascending: false })
      .order('id', { ascending: false });

    if (date) {
      query = query.eq('date', date);
    }

    const { data, error } = await query;
    if (error) {
      if (isExpensesMissingError(error)) return expensesTableMissingResponse();
      throw error;
    }

    const rows = Array.isArray(data) ? data : [];
    const total = rows.reduce((sum, row) => sum + Number(row?.amount ?? 0), 0);

    return NextResponse.json({
      success: true,
      data: rows,
      summary: {
        total_amount: Number(total.toFixed(2)),
        count: rows.length,
      },
    });
  } catch (error) {
    return serverError(error, req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['owner']);
    if (auth instanceof NextResponse) return auth;

    const { date, type, amount } = await req.json();
    const normalizedDate = normalizeDate(date) || new Date().toISOString().slice(0, 10);
    const normalizedType = typeof type === 'string' ? type.trim() : '';
    const parsedAmount = Number(amount);

    if (!normalizedType) return badRequest('type is required');
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) return badRequest('amount must be a non-negative number');

    const { data, error } = await supabase
      .from('expenses')
      .insert([
        {
          date: normalizedDate,
          type: normalizedType,
          amount: parsedAmount,
        },
      ])
      .select('id, date, type, amount, created_at')
      .single();

    if (error) {
      if (isExpensesMissingError(error)) return expensesTableMissingResponse();
      throw error;
    }

    await writeAuditEvent({
      req,
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      actorRole: auth.role,
      action: 'expenses.create',
      resource: 'expenses',
      resourceId: data?.id ?? null,
      outcome: 'success',
      after: data ?? null,
    });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return serverError(error, req);
  }
}
