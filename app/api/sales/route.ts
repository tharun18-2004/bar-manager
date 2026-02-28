import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { badRequest, parseDateRange, serverError } from '@/lib/api-response';
import { writeAuditEvent } from '@/lib/audit-log';
import { currentDayUtcRange, currentMonthUtcRange, parseTimezoneOffset } from '@/lib/order-analytics';

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

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['staff', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { inventory_id, inventory_size_id, quantity } = await req.json();
    const parsedQuantity = quantity === undefined || quantity === null ? 1 : Number(quantity);

    if (!inventory_id || typeof inventory_id !== 'string' || inventory_id.trim().length === 0) {
      return badRequest('inventory_id is required');
    }
    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      return badRequest('quantity must be a positive integer');
    }

    const normalizedInventoryId = inventory_id.trim();
    const requestedInventorySizeId =
      typeof inventory_size_id === 'string' && inventory_size_id.trim().length > 0
        ? inventory_size_id.trim()
        : null;
    let normalizedInventorySizeId =
      requestedInventorySizeId && !requestedInventorySizeId.startsWith('auto:')
        ? requestedInventorySizeId
        : null;

    if (!normalizedInventorySizeId) {
      const { data: sizeRows, error: sizeLookupError } = await supabase
        .from('inventory_sizes')
        .select('id')
        .eq('inventory_id', normalizedInventoryId)
        .eq('is_active', true)
        .order('size_ml', { ascending: true })
        .limit(1);
      if (sizeLookupError) {
        if (isRelationMissingError(sizeLookupError, 'inventory_sizes')) {
          return badRequest('inventory_sizes table is missing. Run latest inventory size migration.');
        }
        throw sizeLookupError;
      }
      normalizedInventorySizeId = sizeRows?.[0]?.id ? String(sizeRows[0].id) : null;
    }

    if (!normalizedInventorySizeId) {
      const { data: inventoryRows, error: inventoryError } = await supabase
        .from('inventory')
        .select('id, selling_price, sale_price, unit_price')
        .eq('id', normalizedInventoryId)
        .limit(1);
      if (inventoryError) throw inventoryError;
      const inventoryRow = inventoryRows?.[0];
      if (!inventoryRow) {
        return badRequest('inventory item not found');
      }

      const defaultSellingPrice = Number(
        inventoryRow.selling_price ?? inventoryRow.sale_price ?? inventoryRow.unit_price ?? 0
      );
      if (!Number.isFinite(defaultSellingPrice) || defaultSellingPrice <= 0) {
        return badRequest('inventory item has no selling price configured');
      }

      const { error: upsertError } = await supabase
        .from('inventory_sizes')
        .upsert(
          [
            {
              inventory_id: normalizedInventoryId,
              size_label: 'Peg 60 ml',
              size_ml: 60,
              selling_price: defaultSellingPrice,
              is_active: true,
            },
          ],
          { onConflict: 'inventory_id,size_ml' }
        );
      if (upsertError) throw upsertError;

      const { data: createdSizeRows, error: createdSizeLookupError } = await supabase
        .from('inventory_sizes')
        .select('id')
        .eq('inventory_id', normalizedInventoryId)
        .eq('size_ml', 60)
        .limit(1);
      if (createdSizeLookupError) throw createdSizeLookupError;
      normalizedInventorySizeId = createdSizeRows?.[0]?.id ? String(createdSizeRows[0].id) : null;
    }

    if (!normalizedInventorySizeId) {
      throw new Error('Failed to resolve inventory size for sale');
    }

    const { data, error } = await supabase.rpc('create_sale_with_stock', {
      p_inventory_id: normalizedInventoryId,
      p_inventory_size_id: normalizedInventorySizeId,
      p_quantity: parsedQuantity,
      p_staff_name: auth.user.email ?? 'staff',
    });

    if (error) {
      const message = getErrorMessage(error).toLowerCase();
      if (message.includes('insufficient stock')) {
        return badRequest('Insufficient stock for requested quantity.');
      }
      if (message.includes('inventory item not found')) {
        return badRequest('inventory item not found');
      }
      if (message.includes('inventory size not found') || message.includes('inactive')) {
        return badRequest('inventory size not found or inactive');
      }
      if (message.includes('quantity must be > 0')) {
        return badRequest('quantity must be a positive integer');
      }
      throw error;
    }

    const saleRow = Array.isArray(data) ? data[0] : data;
    await writeAuditEvent({
      req,
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      actorRole: auth.role,
      action: 'sale.create',
      resource: 'sales',
      resourceId: (saleRow as any)?.sale_id ?? null,
      metadata: {
        inventory_id: normalizedInventoryId,
        inventory_size_id: normalizedInventorySizeId,
        quantity: parsedQuantity,
      },
      after: saleRow,
    });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return serverError(error, req);
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['staff', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const staff = searchParams.get('staff');
    const voided = searchParams.get('voided');
    const range = parseDateRange(searchParams.get('range'));
    const timezoneOffsetMinutes = parseTimezoneOffset(searchParams.get('tz_offset'));

    if (searchParams.get('range') && !range) {
      return badRequest("range must be one of: today, week, month");
    }
    if (voided !== null && voided !== 'true' && voided !== 'false') {
      return badRequest('voided must be one of: true, false');
    }

    let query = supabase.from('sales').select('*');

    if (auth.role === 'owner' && staff) {
      query = query.eq('staff_name', staff);
    }
    if (voided !== null) query = query.eq('is_voided', voided === 'true');
    if (range) query = query.gte('created_at', rangeStartIsoWithTimezone(range, timezoneOffsetMinutes));

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    return serverError(error, req);
  }
}

