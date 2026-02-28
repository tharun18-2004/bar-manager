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

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['owner']);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json().catch(() => ({}));
    const date = parseDateParam(body?.date);
    if (!date) return badRequest('date is required in YYYY-MM-DD format');

    const { data: existingRows, error: existingError } = await supabase
      .from('stock_register_day_locks')
      .select('id, date, month, year, locked_by_email, created_at')
      .eq('date', date)
      .limit(1);

    if (existingError) {
      if (isRelationMissingError(existingError, 'stock_register_day_locks')) {
        return badRequest('stock_register_day_locks table is missing. Run lock-day migration first.');
      }
      throw existingError;
    }

    const existing = Array.isArray(existingRows) ? existingRows[0] : null;
    if (!existing) {
      return NextResponse.json({ success: true, unlocked: false, already_unlocked: true });
    }

    const { error: deleteError } = await supabase
      .from('stock_register_day_locks')
      .delete()
      .eq('date', date);

    if (deleteError) throw deleteError;

    await writeAuditEvent({
      req,
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      actorRole: auth.role,
      action: 'stock_register.unlock_day',
      resource: 'stock_register_day_locks',
      resourceId: existing.id ?? null,
      metadata: { date },
      before: existing,
      after: null,
    });

    return NextResponse.json({ success: true, unlocked: true, already_unlocked: false });
  } catch (error) {
    return serverError(error, req);
  }
}
