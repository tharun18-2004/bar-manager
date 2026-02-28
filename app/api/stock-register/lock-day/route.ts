import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { badRequest, serverError } from '@/lib/api-response';
import { supabase } from '@/lib/supabase';
import { writeAuditEvent } from '@/lib/audit-log';

function parseDateParam(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

function getMonthYearFromDate(dateIso: string) {
  return {
    year: Number(dateIso.slice(0, 4)),
    month: Number(dateIso.slice(5, 7)),
  };
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

function isUniqueViolation(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: unknown }).code ?? '');
    if (code === '23505') return true;
  }
  return getErrorMessage(error).toLowerCase().includes('duplicate key');
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['owner']);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json().catch(() => ({}));
    const date = parseDateParam(body?.date);
    if (!date) return badRequest('date is required in YYYY-MM-DD format');

    const derived = getMonthYearFromDate(date);
    const month = Number(body?.month ?? derived.month);
    const year = Number(body?.year ?? derived.year);

    if (!Number.isInteger(month) || month < 1 || month > 12) return badRequest('month must be between 1 and 12');
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return badRequest('year must be between 2000 and 2100');

    const payload = {
      date,
      month,
      year,
      locked_by_user_id: auth.user.id,
      locked_by_email: auth.user.email ?? null,
    };

    const { data: insertedRow, error: insertError } = await supabase
      .from('stock_register_day_locks')
      .insert([payload])
      .select('id, date, month, year, locked_by_email, created_at')
      .single();

    if (insertError) {
      if (isRelationMissingError(insertError, 'stock_register_day_locks')) {
        return badRequest('stock_register_day_locks table is missing. Run lock-day migration first.');
      }
      if (!isUniqueViolation(insertError)) throw insertError;

      const { data: existingRow, error: existingError } = await supabase
        .from('stock_register_day_locks')
        .select('id, date, month, year, locked_by_email, created_at')
        .eq('date', date)
        .single();
      if (existingError) throw existingError;

      return NextResponse.json({
        success: true,
        data: existingRow,
        already_locked: true,
      });
    }

    await writeAuditEvent({
      req,
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      actorRole: auth.role,
      action: 'stock_register.lock_day',
      resource: 'stock_register_day_locks',
      resourceId: insertedRow?.id ?? null,
      metadata: { date, month, year },
      after: insertedRow,
    });

    return NextResponse.json({ success: true, data: insertedRow, already_locked: false }, { status: 201 });
  } catch (error) {
    return serverError(error, req);
  }
}
