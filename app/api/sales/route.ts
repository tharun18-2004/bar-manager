import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { badRequest, parseDateRange, rangeStartIso, serverError } from '@/lib/api-response';
import { writeAuditEvent } from '@/lib/audit-log';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['staff', 'manager', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { item_name, amount, quantity, peg_size_ml, item_id, staff_name } = await req.json();
    const parsedAmount = Number(amount);
    const parsedQuantity = quantity === undefined || quantity === null ? 1 : Number(quantity);
    const parsedPegSizeMl = peg_size_ml === undefined || peg_size_ml === null ? 60 : Number(peg_size_ml);

    if (!item_name || typeof item_name !== 'string' || item_name.trim().length === 0) {
      return badRequest('item_name is required');
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return badRequest('amount must be a positive number');
    }
    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      return badRequest('quantity must be a positive integer');
    }
    if (!Number.isFinite(parsedPegSizeMl) || parsedPegSizeMl <= 0) {
      return badRequest('peg_size_ml must be a positive number');
    }

    const itemName = item_name.trim();
    const { data, error } = await supabase
      .from('sales')
      .insert([
        {
          item_name: itemName,
          amount: parsedAmount,
          is_voided: false,
          staff_name: auth.user.email ?? staff_name ?? 'staff',
        },
      ])
      .select();

    if (error) throw error;

    let inventoryQuery = supabase
      .from('inventory')
      .select('id, quantity, stock_quantity, current_stock_ml, bottle_size_ml')
      .limit(1);

    const normalizedItemId =
      typeof item_id === 'number'
        ? item_id
        : typeof item_id === 'string'
          ? item_id.trim()
          : '';
    if (
      (typeof normalizedItemId === 'number' && Number.isInteger(normalizedItemId) && normalizedItemId > 0) ||
      (typeof normalizedItemId === 'string' && normalizedItemId.length > 0)
    ) {
      inventoryQuery = inventoryQuery.eq('id', normalizedItemId);
    } else {
      inventoryQuery = inventoryQuery.eq('item_name', itemName);
    }

    const { data: inventoryRows, error: inventorySelectError } = await inventoryQuery;

    if (inventorySelectError) throw inventorySelectError;

    const targetInventory = inventoryRows?.[0];
    if (targetInventory && targetInventory.id !== undefined && targetInventory.id !== null) {
      const bottleSizeMl = Number(targetInventory.bottle_size_ml);
      const fallbackBottleSizeMl = Number.isFinite(bottleSizeMl) && bottleSizeMl > 0 ? bottleSizeMl : 750;
      const currentStockMlRaw = Number(targetInventory.current_stock_ml);
      const currentStockMl =
        Number.isFinite(currentStockMlRaw) && currentStockMlRaw >= 0
          ? currentStockMlRaw
          : Number(targetInventory.stock_quantity ?? targetInventory.quantity ?? 0) * fallbackBottleSizeMl;
      const requiredStockMl = parsedQuantity * parsedPegSizeMl;

      if (currentStockMl < requiredStockMl) {
        return badRequest('Out of stock for requested peg quantity');
      }

      const nextStockMl = Number((currentStockMl - requiredStockMl).toFixed(2));
      const nextStockQuantity = Math.max(0, Math.floor(nextStockMl / fallbackBottleSizeMl));

      const { error: inventoryUpdateError } = await supabase
        .from('inventory')
        .update({
          current_stock_ml: nextStockMl,
          stock_quantity: nextStockQuantity,
          quantity: nextStockQuantity,
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetInventory.id);

      if (inventoryUpdateError) throw inventoryUpdateError;
    }

    const saleRow = Array.isArray(data) ? data[0] : null;
    await writeAuditEvent({
      req,
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      actorRole: auth.role,
      action: 'sale.create',
      resource: 'sales',
      resourceId: saleRow?.id ?? null,
      metadata: {
        item_name: itemName,
        amount: parsedAmount,
        quantity: parsedQuantity,
        peg_size_ml: parsedPegSizeMl,
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
    const auth = await requireAuth(req, ['staff', 'manager', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const staff = searchParams.get('staff');
    const voided = searchParams.get('voided');
    const range = parseDateRange(searchParams.get('range'));

    if (searchParams.get('range') && !range) {
      return badRequest("range must be one of: today, week, month");
    }
    if (voided !== null && voided !== 'true' && voided !== 'false') {
      return badRequest('voided must be one of: true, false');
    }

    let query = supabase.from('sales').select('*');

    if (auth.role !== 'owner') {
      query = query.eq('staff_name', auth.user.email ?? 'staff');
    } else if (staff) {
      query = query.eq('staff_name', staff);
    }
    if (voided !== null) query = query.eq('is_voided', voided === 'true');
    if (range) query = query.gte('created_at', rangeStartIso(range));

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return serverError(error, req);
  }
}

