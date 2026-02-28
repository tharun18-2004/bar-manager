import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { badRequest, parseDateRange, serverError } from '@/lib/api-response';
import { writeAuditEvent } from '@/lib/audit-log';
import { currentDayUtcRange, currentMonthUtcRange, parseTimezoneOffset } from '@/lib/order-analytics';

function rangeStartIsoWithTimezone(range: 'today' | 'week' | 'month', timezoneOffsetMinutes: number) {
  if (range === 'today') {
    return currentDayUtcRange(timezoneOffsetMinutes).startIso;
  }
  if (range === 'month') {
    return currentMonthUtcRange(timezoneOffsetMinutes).startIso;
  }
  const dayStartIso = currentDayUtcRange(timezoneOffsetMinutes).startIso;
  const weekStart = new Date(dayStartIso);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  return weekStart.toISOString();
}

function isRelationMissingError(error: unknown, relation: string) {
  if (!error || typeof error !== 'object') return false;
  const message = 'message' in error && typeof error.message === 'string' ? error.message.toLowerCase() : '';
  return (
    (message.includes(relation.toLowerCase()) && message.includes('does not exist')) ||
    message.includes(`could not find the table 'public.${relation.toLowerCase()}'`)
  );
}

function isMissingColumnError(error: unknown, column: string) {
  if (!error || typeof error !== 'object') return false;
  const message = 'message' in error && typeof error.message === 'string' ? error.message.toLowerCase() : '';
  return message.includes(column.toLowerCase()) && message.includes('does not exist');
}

async function fallbackVoidsFromSales(staff: string | null, range: 'today' | 'week' | 'month' | null, timezoneOffsetMinutes: number) {
  let query = supabase
    .from('sales')
    .select('id, staff_name, void_reason, amount, created_at')
    .eq('is_voided', true);

  if (staff) query = query.eq('staff_name', staff);
  if (range) query = query.gte('created_at', rangeStartIsoWithTimezone(range, timezoneOffsetMinutes));

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  return rows.map((row: any) => ({
    id: `sales-void-${String(row?.id ?? '')}`,
    sale_id: row?.id ?? null,
    staff_name: row?.staff_name ?? null,
    void_reason: row?.void_reason ?? 'voided',
    voided_amount: Number(row?.amount ?? 0),
    created_at: row?.created_at ?? null,
    source: 'sales_fallback',
  }));
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['staff', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { sale_id, staff_name, void_reason, voided_amount } = await req.json();
    const parsedSaleId = Number(sale_id);
    const parsedVoidedAmount = Number(voided_amount);

    const isInventorySaleVoid = Number.isInteger(parsedSaleId) && parsedSaleId > 0;
    if (!void_reason || typeof void_reason !== 'string' || void_reason.trim().length < 3) {
      return badRequest('void_reason must be at least 3 characters');
    }
    if (!Number.isFinite(parsedVoidedAmount) || parsedVoidedAmount <= 0) {
      return badRequest('voided_amount must be a positive number');
    }

    let restoredStock: { inventory_id: string; restored_ml: number } | null = null;
    if (isInventorySaleVoid) {
      let saleLookup = await supabase
        .from('sales')
        .select('id, is_voided, amount, inventory_size_id, size_ml, quantity')
        .eq('id', parsedSaleId)
        .maybeSingle();
      if (saleLookup.error && isMissingColumnError(saleLookup.error, 'inventory_size_id')) {
        saleLookup = await supabase
          .from('sales')
          .select('id, is_voided, amount, size_ml, quantity')
          .eq('id', parsedSaleId)
          .maybeSingle();
      }
      if (saleLookup.error) throw saleLookup.error;

      const saleRow = saleLookup.data as any;
      if (!saleRow) {
        return NextResponse.json({ success: false, error: 'sale not found' }, { status: 404 });
      }
      if (saleRow.is_voided) {
        return NextResponse.json({ success: false, error: 'sale is already voided' }, { status: 409 });
      }

      const quantity = Math.max(1, Number(saleRow.quantity ?? 1));
      let resolvedSizeMl = Number(saleRow.size_ml ?? 0);
      let inventoryId: string | null = null;
      const inventorySizeId = saleRow.inventory_size_id ? String(saleRow.inventory_size_id) : '';
      if (inventorySizeId) {
        const { data: sizeRow, error: sizeError } = await supabase
          .from('inventory_sizes')
          .select('inventory_id, size_ml')
          .eq('id', inventorySizeId)
          .maybeSingle();
        if (sizeError) throw sizeError;
        inventoryId = sizeRow?.inventory_id ? String(sizeRow.inventory_id) : null;
        const sizeMlFromSize = Number(sizeRow?.size_ml ?? 0);
        if (Number.isFinite(sizeMlFromSize) && sizeMlFromSize > 0) {
          resolvedSizeMl = sizeMlFromSize;
        }
      }

      if (inventoryId && Number.isFinite(resolvedSizeMl) && resolvedSizeMl > 0) {
        const restoredMl = resolvedSizeMl * quantity;
        const { data: inventoryRow, error: inventoryError } = await supabase
          .from('inventory')
          .select('id, bottle_size_ml, current_stock_ml, stock_quantity, quantity')
          .eq('id', inventoryId)
          .maybeSingle();
        if (inventoryError) throw inventoryError;
        if (inventoryRow) {
          const bottleSizeMl = Math.max(1, Number((inventoryRow as any).bottle_size_ml ?? 750));
          const currentStockMl = Number(
            (inventoryRow as any).current_stock_ml ??
              Number((inventoryRow as any).stock_quantity ?? (inventoryRow as any).quantity ?? 0) * bottleSizeMl
          );
          const safeCurrentStockMl = Number.isFinite(currentStockMl) ? currentStockMl : 0;
          const nextStockMl = safeCurrentStockMl + restoredMl;
          const nextStockQty = Math.max(0, Math.floor(nextStockMl / bottleSizeMl));
          const { error: restoreError } = await supabase
            .from('inventory')
            .update({
              current_stock_ml: nextStockMl,
              stock_quantity: nextStockQty,
              quantity: nextStockQty,
              updated_at: new Date().toISOString(),
            })
            .eq('id', inventoryId);
          if (restoreError) throw restoreError;
          restoredStock = { inventory_id: inventoryId, restored_ml: restoredMl };
        }
      }
    }

    // Insert into void_logs when available. If table is missing, continue for inventory-sale void path.
    let voidLogWarning: string | null = null;
    const { error: logError } = await supabase
      .from('void_logs')
      .insert([
        {
          sale_id: isInventorySaleVoid ? parsedSaleId : 0,
          staff_name: auth.user.email ?? staff_name ?? 'staff',
          void_reason: void_reason.trim(),
          voided_amount: parsedVoidedAmount,
        },
      ]);

    if (logError && isRelationMissingError(logError, 'void_logs')) {
      voidLogWarning = 'void_logs table missing; recorded void in sales only.';
    } else if (logError) {
      throw logError;
    }

    // Update inventory sales to mark as voided. For cart-cancel voids (sale_id <= 0), only log void event.
    let data: any[] = [];
    if (isInventorySaleVoid) {
      const updateResult = await supabase
        .from('sales')
        .update({ is_voided: true, void_reason: void_reason.trim() })
        .eq('id', parsedSaleId)
        .eq('is_voided', false)
        .select();
      if (updateResult.error) throw updateResult.error;
      data = Array.isArray(updateResult.data) ? updateResult.data : [];
      if (data.length === 0) {
        return NextResponse.json({ success: false, error: 'sale is already voided' }, { status: 409 });
      }
    }

    await writeAuditEvent({
      req,
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      actorRole: auth.role,
      action: 'void.create',
      resource: 'sales',
      resourceId: isInventorySaleVoid ? parsedSaleId : null,
      outcome: 'success',
      metadata: {
        mode: isInventorySaleVoid ? 'sale_void' : 'cart_void',
        reason: void_reason.trim(),
        voidedAmount: parsedVoidedAmount,
        restored_stock: restoredStock,
      },
      after: data?.[0] ?? null,
    });

    return NextResponse.json({ success: true, data, warning: voidLogWarning }, { status: 201 });
  } catch (error) {
    return serverError(error, req);
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['owner']);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const staff = searchParams.get('staff');
    const range = parseDateRange(searchParams.get('range'));
    const timezoneOffsetMinutes = parseTimezoneOffset(searchParams.get('tz_offset'));

    if (searchParams.get('range') && !range) {
      return badRequest("range must be one of: today, week, month");
    }

    let primaryQuery = supabase.from('void_logs').select('*');
    if (staff) primaryQuery = primaryQuery.eq('staff_name', staff);
    if (range) primaryQuery = primaryQuery.gte('created_at', rangeStartIsoWithTimezone(range, timezoneOffsetMinutes));

    let { data, error } = await primaryQuery.order('created_at', { ascending: false });

    if (error && (isMissingColumnError(error, 'created_at') || isMissingColumnError(error, 'staff_name'))) {
      let retryQuery = supabase.from('void_logs').select('*');
      if (staff) retryQuery = retryQuery.eq('staff_name', staff);
      const retry = await retryQuery.order('id', { ascending: false });
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      const fallbackRows = await fallbackVoidsFromSales(staff, range, timezoneOffsetMinutes);
      const warning = isRelationMissingError(error, 'void_logs')
        ? 'void_logs table is missing. Showing voided sales fallback. Run void-logs migration to enable full void analytics.'
        : 'void_logs query failed. Showing voided sales fallback.';
      return NextResponse.json({ success: true, data: fallbackRows, warning });
    }

    const rows = Array.isArray(data) ? data : [];
    if (rows.length > 0) {
      return NextResponse.json({ success: true, data: rows });
    }

    const fallbackRows = await fallbackVoidsFromSales(staff, range, timezoneOffsetMinutes);
    return NextResponse.json({ success: true, data: fallbackRows });
  } catch (error) {
    return serverError(error, req);
  }
}


