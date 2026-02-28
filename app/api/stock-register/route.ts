import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { badRequest, serverError } from '@/lib/api-response';
import { supabase } from '@/lib/supabase';
import { writeAuditEvent } from '@/lib/audit-log';

type StockRegisterInputRow = {
  item_id?: unknown;
  opening_balance?: unknown;
  received?: unknown;
  closing_balance?: unknown;
};

function parsePositiveInteger(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

function parseMonth(value: string | null) {
  const parsed = Number(value ?? '');
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) return null;
  return parsed;
}

function parseYear(value: string | null) {
  const parsed = Number(value ?? '');
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) return null;
  return parsed;
}

function getMonthYearDefaults() {
  const now = new Date();
  return {
    month: now.getUTCMonth() + 1,
    year: now.getUTCFullYear(),
  };
}

function parseDateParam(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

function parseTimezoneOffset(value: string | null) {
  const parsed = Number(value ?? '0');
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-840, Math.min(840, Math.trunc(parsed)));
}

function buildDefaultDateFor(month: number, year: number) {
  const now = new Date();
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth() + 1;
  if (month === nowMonth && year === nowYear) return now.toISOString().slice(0, 10);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
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

function isSchemaCacheTableMissing(error: unknown, relation: string) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes(relation.toLowerCase()) && message.includes('schema cache');
}

function isMissingColumnError(error: unknown, column: string) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes(column.toLowerCase()) && message.includes('column');
}

function isNoRowsError(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: unknown }).code ?? '');
    if (code === 'PGRST116') return true;
  }
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('0 rows') || message.includes('no rows');
}

function devDiagnostics(rawError: unknown) {
  if (process.env.NODE_ENV === 'production') return undefined;
  return {
    supabase_url_host: (() => {
      try {
        return new URL(String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')).host;
      } catch {
        return null;
      }
    })(),
    has_service_role_key: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.trim().length > 0),
    raw_error: getErrorMessage(rawError),
  };
}

type DayLockRow = {
  date: string;
  month: number;
  year: number;
  locked_by_email: string | null;
  created_at: string | null;
};

async function getDayLock(dateIso: string): Promise<{ row: DayLockRow | null; tableMissing: boolean }> {
  const { data, error } = await supabase
    .from('stock_register_day_locks')
    .select('date, month, year, locked_by_email, created_at')
    .eq('date', dateIso)
    .maybeSingle();

  if (error) {
    if (
      isRelationMissingError(error, 'stock_register_day_locks') ||
      isSchemaCacheTableMissing(error, 'stock_register_day_locks')
    ) {
      return { row: null, tableMissing: true };
    }
    if (isNoRowsError(error)) {
      return { row: null, tableMissing: false };
    }
    throw error;
  }

  return {
    row: data
      ? {
          date: String(data.date),
          month: Number(data.month),
          year: Number(data.year),
          locked_by_email: data.locked_by_email ? String(data.locked_by_email) : null,
          created_at: data.created_at ? String(data.created_at) : null,
        }
      : null,
    tableMissing: false,
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['staff', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const defaults = getMonthYearDefaults();
    const monthParam = parseMonth(searchParams.get('month')) ?? defaults.month;
    const yearParam = parseYear(searchParams.get('year')) ?? defaults.year;
    const registerDate = parseDateParam(searchParams.get('date')) ?? buildDefaultDateFor(monthParam, yearParam);
    const timezoneOffsetMinutes = parseTimezoneOffset(searchParams.get('tz_offset'));
    const { month, year } = getMonthYearFromDate(registerDate);
    const lockStatus = await getDayLock(registerDate);

    const { data: inventoryRows, error: inventoryError } = await supabase
      .from('inventory')
      .select('id, item_name, selling_price, unit_price, stock_quantity, quantity')
      .order('item_name', { ascending: true });
    if (inventoryError) throw inventoryError;

    let registerRowsRaw: any[] | null = null;
    let registerError: any = null;
    {
      const firstAttempt = await supabase
        .from('stock_register')
        .select('id, item_id, opening_balance, received, sale, total, closing_balance, amount, date, month, year, updated_at')
        .eq('date', registerDate);
      registerRowsRaw = firstAttempt.data;
      registerError = firstAttempt.error;
    }

    // Backward compatibility for environments where `total` exists in DB but is not in schema cache yet.
    if (registerError && isMissingColumnError(registerError, 'total')) {
      const retry = await supabase
        .from('stock_register')
        .select('id, item_id, opening_balance, received, sale, closing_balance, amount, date, month, year, updated_at')
        .eq('date', registerDate);
      registerRowsRaw = retry.data;
      registerError = retry.error;
    }

    const treatAsMissingTable =
      Boolean(registerError) &&
      (isRelationMissingError(registerError, 'stock_register') ||
        isSchemaCacheTableMissing(registerError, 'stock_register'));
    if (registerError && !treatAsMissingTable) throw registerError;
    const currentRowByItem = new Map<string, any>();
    for (const row of treatAsMissingTable ? [] : registerRowsRaw ?? []) {
      const itemId = String(row.item_id ?? '');
      if (!itemId) continue;
      currentRowByItem.set(itemId, row);
    }

    const previousCloseByItem = new Map<string, number>();
    if (!treatAsMissingTable) {
      const previousRowsResult = await supabase
        .from('stock_register')
        .select('item_id, closing_balance, date')
        .lt('date', registerDate)
        .order('date', { ascending: false });
      if (previousRowsResult.error) throw previousRowsResult.error;

      for (const row of previousRowsResult.data ?? []) {
        const itemId = String(row.item_id ?? '');
        if (!itemId || previousCloseByItem.has(itemId)) continue;
        previousCloseByItem.set(itemId, parsePositiveInteger(row.closing_balance));
      }
    }

    const rows = (inventoryRows ?? []).map((item) => {
      const itemId = String(item.id);
      const current = currentRowByItem.get(itemId);
      const opening = parsePositiveInteger(
        current?.opening_balance ?? previousCloseByItem.get(itemId) ?? 0
      );
      const received = parsePositiveInteger(current?.received ?? 0);
      const total = opening + received;
      const closing = parsePositiveInteger(current?.closing_balance ?? total);
      const sale = Math.max(0, total - closing);
      const unitPrice = Number(item.selling_price ?? item.unit_price ?? 0);
      const amount = Number((sale * (Number.isFinite(unitPrice) ? unitPrice : 0)).toFixed(2));
      return {
        id: current?.id ?? null,
        item_id: itemId,
        brand_name: String(item.item_name ?? ''),
        opening_balance: opening,
        received,
        total,
        sale,
        closing_balance: closing,
        amount,
        unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
        date: registerDate,
        month,
        year,
      };
    });

    const totals = rows.reduce(
      (acc, row) => {
        acc.total_sold += row.sale;
        acc.total_revenue += row.amount;
        acc.remaining_stock += row.closing_balance;
        return acc;
      },
      { total_sold: 0, total_revenue: 0, remaining_stock: 0 }
    );

    return NextResponse.json({
      success: true,
      data: rows,
      warning: treatAsMissingTable
        ? 'stock_register table is not currently visible via API schema cache. Showing inventory baseline rows.'
        : null,
      diagnostics: treatAsMissingTable ? devDiagnostics(registerError) : undefined,
      selected: {
        date: registerDate,
        month,
        year,
        tz_offset: timezoneOffsetMinutes,
      },
      is_day_locked: Boolean(lockStatus.row),
      locked_by_email: lockStatus.row?.locked_by_email ?? null,
      locked_at: lockStatus.row?.created_at ?? null,
      summary: {
        total_bottles_sold: totals.total_sold,
        total_revenue: Number(totals.total_revenue.toFixed(2)),
        current_remaining_stock: totals.remaining_stock,
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

    const body = await req.json().catch(() => ({}));
    const monthParam = parseMonth(String(body?.month ?? ''));
    const yearParam = parseYear(String(body?.year ?? ''));
    const registerDateRaw = parseDateParam(typeof body?.date === 'string' ? body.date.trim() : null);
    parseTimezoneOffset(body?.tz_offset === undefined || body?.tz_offset === null ? null : String(body.tz_offset));
    const registerRows = Array.isArray(body?.rows) ? (body.rows as StockRegisterInputRow[]) : [];

    if (!monthParam || !yearParam) return badRequest('month and year are required');
    if (registerRows.length === 0) return badRequest('rows must be a non-empty array');

    const registerDate = registerDateRaw ?? buildDefaultDateFor(monthParam, yearParam);
    const { month, year } = getMonthYearFromDate(registerDate);
    const lockStatus = await getDayLock(registerDate);
    if (lockStatus.row) {
      return NextResponse.json(
        {
          success: false,
          error: 'This day is locked and cannot be edited.',
          is_day_locked: true,
          locked_by_email: lockStatus.row.locked_by_email,
          locked_at: lockStatus.row.created_at,
        },
        { status: 403 }
      );
    }

    const itemIds = registerRows.map((row) => String(row.item_id ?? '')).filter((id) => id.length > 0);
    if (itemIds.length === 0) {
      return badRequest('rows must include valid item_id');
    }

    const { data: inventoryRows, error: inventoryError } = await supabase
      .from('inventory')
      .select('id, item_name, selling_price, unit_price, bottle_size_ml')
      .in('id', itemIds);
    if (inventoryError) throw inventoryError;

    const inventoryMap = new Map<string, any>((inventoryRows ?? []).map((row) => [String(row.id), row]));
    const upsertRows = registerRows.map((row) => {
      const itemId = String(row.item_id ?? '');
      const opening = parsePositiveInteger(row.opening_balance);
      const received = parsePositiveInteger(row.received);
      const inventory = inventoryMap.get(itemId);
      const total = opening + received;
      const closing = parsePositiveInteger(row.closing_balance);
      const sale = Math.max(0, total - closing);
      const unitPrice = Number(inventory?.selling_price ?? inventory?.unit_price ?? 0);
      return {
        item_id: itemId,
        opening_balance: opening,
        received,
        sale,
        total,
        closing_balance: closing,
        amount: Number((sale * (Number.isFinite(unitPrice) ? unitPrice : 0)).toFixed(2)),
        date: registerDate,
        month,
        year,
        created_by: auth.user.id,
        updated_at: new Date().toISOString(),
      };
    });

    let savedRows: any[] | null = null;
    let upsertError: any = null;
    {
      const firstUpsert = await supabase
        .from('stock_register')
        .upsert(upsertRows, { onConflict: 'item_id,date' })
        .select();
      savedRows = firstUpsert.data;
      upsertError = firstUpsert.error;
    }

    if (upsertError && isMissingColumnError(upsertError, 'total')) {
      const rowsWithoutTotal = upsertRows.map(({ total: _ignored, ...rest }) => rest);
      const retryUpsert = await supabase
        .from('stock_register')
        .upsert(rowsWithoutTotal, { onConflict: 'item_id,date' })
        .select();
      savedRows = retryUpsert.data;
      upsertError = retryUpsert.error;
    }

    if (upsertError) {
      if (isRelationMissingError(upsertError, 'stock_register')) {
        const diagnostics = devDiagnostics(upsertError);
        if (diagnostics) {
          return NextResponse.json(
            {
              success: false,
              error: 'stock_register table is missing. Run stock register migration first.',
              diagnostics,
            },
            { status: 400 }
          );
        }
        return badRequest('stock_register table is missing. Run stock register migration first.');
      }
      throw upsertError;
    }

    for (const row of upsertRows) {
      const inventory = inventoryMap.get(String(row.item_id));
      if (!inventory) continue;
      const bottleSizeMl = Number(inventory.bottle_size_ml ?? 750);
      const safeBottleSizeMl = Number.isFinite(bottleSizeMl) && bottleSizeMl > 0 ? bottleSizeMl : 750;
      const currentStockMl = row.closing_balance * safeBottleSizeMl;
      const { error: inventoryUpdateError } = await supabase
        .from('inventory')
        .update({
          stock_quantity: row.closing_balance,
          quantity: row.closing_balance,
          current_stock_ml: currentStockMl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.item_id);
      if (inventoryUpdateError) throw inventoryUpdateError;
    }

    await writeAuditEvent({
      req,
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      actorRole: auth.role,
      action: 'stock_register.save',
      resource: 'stock_register',
      metadata: {
        month,
        year,
        date: registerDate,
        row_count: upsertRows.length,
      },
      after: savedRows,
    });

    return NextResponse.json({ success: true, data: savedRows }, { status: 201 });
  } catch (error) {
    return serverError(error, req);
  }
}

