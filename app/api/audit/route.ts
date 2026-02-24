import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { badRequest, serverError } from '@/lib/api-response';
import { supabase } from '@/lib/supabase';

function isValidYyyyMmDd(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function startOfDayIso(dateText: string) {
  return new Date(`${dateText}T00:00:00.000Z`).toISOString();
}

function endOfDayIso(dateText: string) {
  return new Date(`${dateText}T23:59:59.999Z`).toISOString();
}

function isMissingAuditTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('audit_logs') && message.includes('does not exist');
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface AuditCursor {
  created_at: string;
  id: number;
}

interface AuditPageMeta {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

function encodeCursor(cursor: AuditCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(rawCursor: string): AuditCursor | null {
  try {
    const decoded = Buffer.from(rawCursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as Partial<AuditCursor>;
    if (!parsed || typeof parsed.created_at !== 'string' || typeof parsed.id !== 'number') {
      return null;
    }
    if (!Number.isInteger(parsed.id) || parsed.id <= 0) {
      return null;
    }
    if (Number.isNaN(Date.parse(parsed.created_at))) {
      return null;
    }
    return {
      created_at: parsed.created_at,
      id: parsed.id,
    };
  } catch {
    return null;
  }
}

function parseLimit(rawLimit: string | null): number | null {
  if (!rawLimit) return DEFAULT_LIMIT;
  const parsed = Number(rawLimit);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < 1 || parsed > MAX_LIMIT) return null;
  return parsed;
}

function emptyPage(limit: number): AuditPageMeta {
  return { limit, nextCursor: null, hasMore: false };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['owner']);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const actor = searchParams.get('actor')?.trim() || '';
    const action = searchParams.get('action')?.trim() || '';
    const dateFrom = searchParams.get('date_from')?.trim() || '';
    const dateTo = searchParams.get('date_to')?.trim() || '';
    const rawCursor = searchParams.get('cursor')?.trim() || '';
    const parsedLimit = parseLimit(searchParams.get('limit'));
    if (parsedLimit === null) {
      return badRequest(`limit must be an integer between 1 and ${MAX_LIMIT}`);
    }
    const limit = parsedLimit;

    if (dateFrom && !isValidYyyyMmDd(dateFrom)) {
      return badRequest('date_from must be YYYY-MM-DD');
    }
    if (dateTo && !isValidYyyyMmDd(dateTo)) {
      return badRequest('date_to must be YYYY-MM-DD');
    }
    if (dateFrom && dateTo && startOfDayIso(dateFrom) > endOfDayIso(dateTo)) {
      return badRequest('date_from must be before or equal to date_to');
    }
    const decodedCursor = rawCursor ? decodeCursor(rawCursor) : null;
    if (rawCursor && !decodedCursor) {
      return badRequest('cursor is invalid');
    }

    let query = supabase.from('audit_logs').select('*');

    if (actor) query = query.ilike('actor_email', `%${actor}%`);
    if (action) query = query.eq('action', action);
    if (dateFrom) query = query.gte('created_at', startOfDayIso(dateFrom));
    if (dateTo) query = query.lte('created_at', endOfDayIso(dateTo));
    if (decodedCursor) {
      query = query.or(
        `created_at.lt.${decodedCursor.created_at},and(created_at.eq.${decodedCursor.created_at},id.lt.${decodedCursor.id})`
      );
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    if (error) {
      if (isMissingAuditTableError(error)) {
        return NextResponse.json({
          success: true,
          data: [],
          warning: 'audit_logs table is not configured',
          page: emptyPage(limit),
        });
      }
      throw error;
    }

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const pageData = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = pageData[pageData.length - 1] as
      | { created_at?: string; id?: number }
      | undefined;
    const nextCursor =
      hasMore && lastRow && typeof lastRow.created_at === 'string' && typeof lastRow.id === 'number'
        ? encodeCursor({ created_at: lastRow.created_at, id: lastRow.id })
        : null;

    return NextResponse.json({
      success: true,
      data: pageData,
      page: {
        limit,
        nextCursor,
        hasMore,
      },
    });
  } catch (error) {
    return serverError(error, req);
  }
}
