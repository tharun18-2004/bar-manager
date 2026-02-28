import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { badRequest, parseDateRange, serverError } from '@/lib/api-response';
import { writeAuditEvent } from '@/lib/audit-log';
import { currentDayUtcRange, currentMonthUtcRange, parseTimezoneOffset } from '@/lib/order-analytics';

const PAYMENT_METHODS = new Set(['CASH', 'CARD', 'UPI', 'COMPLIMENTARY']);
const SPLIT_MODES = new Set(['BY_ITEM', 'EQUAL', 'BY_GUEST']);
const HARD_DRINK_CATEGORIES = new Set(['whisky', 'whiskey', 'rum', 'vodka', 'gin', 'brandy', 'tequila', 'hard drinks']);
type OrderRecord = {
  id?: string | number;
  order_id?: string;
  total_amount?: number | string;
  payment_method?: string | null;
  [key: string]: unknown;
};
type SplitEntryInput = {
  label?: string;
  detail?: string;
  amount?: number;
};

type SplitBillInput = {
  mode?: string;
  entries?: SplitEntryInput[];
  total?: number;
};

type OrderItemInput = {
  item_id?: string;
  inventory_id?: string;
  inventory_size_id?: string;
  name?: string;
  quantity?: number;
  unit_price?: number;
  line_total?: number;
  peg_size_ml?: number;
};

type CompensationOp = {
  saleId: string | null;
  inventoryId: string;
  restoreQty: number;
  restoreMl: number;
};

function isSchemaCacheMissingColumn(error: unknown): boolean {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');
  return message.includes('schema cache');
}

function isSchemaCacheMissingTable(error: unknown, table: string): boolean {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');
  return message.includes(`table 'public.${table}'`) && message.includes('schema cache');
}

function isMissingColumnError(error: unknown, column: string): boolean {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');
  return message.includes(column) && (message.includes('schema cache') || message.includes('does not exist'));
}

function isMissingCreatedByColumnError(error: unknown): boolean {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');
  return message.includes("Could not find the 'created_by' column");
}

function isRelationMissingError(error: unknown, relation: string): boolean {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');
  return message.includes(relation) && message.includes('does not exist');
}

function rangeStartIsoWithTimezone(range: 'today' | 'week' | 'month', timezoneOffsetMinutes: number) {
  if (range === 'today') return currentDayUtcRange(timezoneOffsetMinutes).startIso;
  if (range === 'month') return currentMonthUtcRange(timezoneOffsetMinutes).startIso;
  const dayStartIso = currentDayUtcRange(timezoneOffsetMinutes).startIso;
  const weekStart = new Date(dayStartIso);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  return weekStart.toISOString();
}

function isHardDrinkCategory(value: unknown) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  return HARD_DRINK_CATEGORIES.has(normalized);
}

async function resolveInventorySizeId(inventoryId: string, requestedInventorySizeId?: string): Promise<string> {
  let normalizedInventorySizeId =
    typeof requestedInventorySizeId === 'string' &&
    requestedInventorySizeId.trim().length > 0 &&
    !requestedInventorySizeId.startsWith('auto:')
      ? requestedInventorySizeId.trim()
      : '';

  const { data: inventoryRows, error: inventoryError } = await supabase
    .from('inventory')
    .select('id, category, bottle_size_ml, selling_price, sale_price, unit_price')
    .eq('id', inventoryId)
    .limit(1);
  if (inventoryError) throw inventoryError;
  const inventoryRow = inventoryRows?.[0];
  if (!inventoryRow) throw new Error('inventory item not found');

  const defaultSellingPrice = Number(
    (inventoryRow as any).selling_price ?? (inventoryRow as any).sale_price ?? (inventoryRow as any).unit_price ?? 0
  );
  if (!Number.isFinite(defaultSellingPrice) || defaultSellingPrice <= 0) {
    throw new Error('inventory item has no selling price configured');
  }

  const isHardDrink = isHardDrinkCategory((inventoryRow as any).category);
  const bottleSizeMlRaw = Number((inventoryRow as any).bottle_size_ml ?? 750);
  const bottleSizeMl = Number.isFinite(bottleSizeMlRaw) && bottleSizeMlRaw > 0 ? Math.trunc(bottleSizeMlRaw) : 750;
  const targetSizeMl = isHardDrink ? 60 : bottleSizeMl;
  const targetSizeLabel = isHardDrink ? 'Peg 60 ml' : 'Unit';

  if (normalizedInventorySizeId) {
    const { data: requestedSizeRow, error: requestedSizeError } = await supabase
      .from('inventory_sizes')
      .select('id, inventory_id, size_ml, is_active')
      .eq('id', normalizedInventorySizeId)
      .maybeSingle();
    if (requestedSizeError && !isRelationMissingError(requestedSizeError, 'inventory_sizes')) {
      throw requestedSizeError;
    }

    const belongsToInventory = String((requestedSizeRow as any)?.inventory_id ?? '') === inventoryId;
    const requestedSizeMl = Number((requestedSizeRow as any)?.size_ml ?? 0);
    const isActive = Boolean((requestedSizeRow as any)?.is_active ?? true);

    if (!requestedSizeRow || !belongsToInventory || !isActive) {
      normalizedInventorySizeId = '';
    } else if (!isHardDrink && requestedSizeMl !== targetSizeMl) {
      // For unit/food items, never use a mismatched legacy size (e.g. old 60 ml peg rows).
      normalizedInventorySizeId = '';
    }
  }

  if (!normalizedInventorySizeId) {
    const { data: sizeRows, error: sizeLookupError } = await supabase
      .from('inventory_sizes')
      .select('id, size_ml')
      .eq('inventory_id', inventoryId)
      .eq('is_active', true)
      .order('size_ml', { ascending: true })
      .limit(25);
    if (sizeLookupError) {
      if (isRelationMissingError(sizeLookupError, 'inventory_sizes')) {
        throw new Error('inventory_sizes table is missing. Run latest inventory size migration.');
      }
      throw sizeLookupError;
    }
    const resolvedRows = Array.isArray(sizeRows) ? sizeRows : [];
    if (resolvedRows.length > 0) {
      if (isHardDrink) {
        const pegSize = resolvedRows.find((row) => Number((row as any).size_ml ?? 0) === 60);
        normalizedInventorySizeId = pegSize?.id ? String(pegSize.id) : (resolvedRows[0]?.id ? String(resolvedRows[0].id) : '');
      } else {
        const exactBottleSize = resolvedRows.find((row) => Number((row as any).size_ml ?? 0) === targetSizeMl);
        if (exactBottleSize?.id) {
          normalizedInventorySizeId = String(exactBottleSize.id);
        }
      }
    }
  }

  if (!normalizedInventorySizeId) {
    const { error: upsertError } = await supabase
      .from('inventory_sizes')
      .upsert(
        [
          {
            inventory_id: inventoryId,
            size_label: targetSizeLabel,
            size_ml: targetSizeMl,
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
      .eq('inventory_id', inventoryId)
      .eq('size_ml', targetSizeMl)
      .limit(1);
    if (createdSizeLookupError) throw createdSizeLookupError;
    normalizedInventorySizeId = createdSizeRows?.[0]?.id ? String(createdSizeRows[0].id) : '';
  }

  if (!normalizedInventorySizeId) throw new Error('Failed to resolve inventory size for sale');
  return normalizedInventorySizeId;
}

async function rollbackSaleById(saleId: string) {
  const { data: saleRow, error: saleError } = await supabase
    .from('sales')
    .select('id, is_voided, inventory_size_id, size_ml, quantity')
    .eq('id', saleId)
    .maybeSingle();
  if (saleError || !saleRow || (saleRow as any).is_voided) return;

  let inventoryId: string | null = null;
  let resolvedSizeMl = Number((saleRow as any).size_ml ?? 0);
  const inventorySizeId = String((saleRow as any).inventory_size_id ?? '');
  if (inventorySizeId) {
    const { data: sizeRow, error: sizeError } = await supabase
      .from('inventory_sizes')
      .select('inventory_id, size_ml')
      .eq('id', inventorySizeId)
      .maybeSingle();
    if (sizeError) return;
    inventoryId = sizeRow?.inventory_id ? String(sizeRow.inventory_id) : null;
    const sizeMlFromSize = Number((sizeRow as any)?.size_ml ?? 0);
    if (Number.isFinite(sizeMlFromSize) && sizeMlFromSize > 0) resolvedSizeMl = sizeMlFromSize;
  }

  if (inventoryId && Number.isFinite(resolvedSizeMl) && resolvedSizeMl > 0) {
    const quantity = Math.max(1, Number((saleRow as any).quantity ?? 1));
    const restoreMl = resolvedSizeMl * quantity;
    const { data: inventoryRow, error: inventoryError } = await supabase
      .from('inventory')
      .select('id, bottle_size_ml, current_stock_ml, stock_quantity, quantity')
      .eq('id', inventoryId)
      .maybeSingle();
    if (!inventoryError && inventoryRow) {
      const bottleSizeMl = Math.max(1, Number((inventoryRow as any).bottle_size_ml ?? 750));
      const currentStockMl = Number(
        (inventoryRow as any).current_stock_ml ??
          Number((inventoryRow as any).stock_quantity ?? (inventoryRow as any).quantity ?? 0) * bottleSizeMl
      );
      const safeCurrentStockMl = Number.isFinite(currentStockMl) ? currentStockMl : 0;
      const nextStockMl = safeCurrentStockMl + restoreMl;
      const nextStockQty = Math.max(0, Math.floor(nextStockMl / bottleSizeMl));
      await supabase
        .from('inventory')
        .update({
          current_stock_ml: nextStockMl,
          stock_quantity: nextStockQty,
          quantity: nextStockQty,
          stock: nextStockQty,
          updated_at: new Date().toISOString(),
        })
        .eq('id', inventoryId);
    }
  }

  await supabase
    .from('sales')
    .update({ is_voided: true, void_reason: 'Order rollback due to stock processing failure' })
    .eq('id', saleId);
}

async function syncLegacyInventoryStock(inventoryId: string) {
  const { data: row, error } = await supabase
    .from('inventory')
    .select('id, stock, stock_quantity, quantity')
    .eq('id', inventoryId)
    .maybeSingle();
  if (error) {
    if (isMissingColumnError(error, 'stock')) return;
    throw error;
  }
  if (!row) return;
  const resolvedQty = Math.max(0, Math.trunc(Number((row as any).stock_quantity ?? (row as any).quantity ?? 0)));
  if (Number((row as any).stock ?? 0) === resolvedQty) return;
  const { error: syncError } = await supabase
    .from('inventory')
    .update({ stock: resolvedQty, updated_at: new Date().toISOString() })
    .eq('id', inventoryId);
  if (syncError && !isMissingColumnError(syncError, 'stock')) {
    throw syncError;
  }
}

async function processSaleWithDirectInventoryFallback(
  item: OrderItemInput,
  authEmail: string | null
): Promise<CompensationOp> {
  const inventoryId = String(item?.inventory_id ?? item?.item_id ?? '').trim();
  const quantity = Number(item?.quantity ?? 1);
  if (!inventoryId) throw new Error('items[].inventory_id (or item_id) is required');
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('items[].quantity must be a positive integer');

  const { data: inventoryRow, error: inventoryError } = await supabase
    .from('inventory')
    .select('id, item_name, brand_name, bottle_size_ml, stock_quantity, quantity, current_stock_ml, selling_price, unit_price')
    .eq('id', inventoryId)
    .maybeSingle();
  if (inventoryError) throw inventoryError;
  if (!inventoryRow) throw new Error('inventory item not found');

  const availableQty = Number((inventoryRow as any).stock_quantity ?? (inventoryRow as any).quantity ?? 0);
  const safeAvailableQty = Number.isFinite(availableQty) ? Math.max(0, Math.trunc(availableQty)) : 0;
  if (safeAvailableQty < quantity) {
    throw new Error('Insufficient stock for one or more items.');
  }

  const bottleSizeMl = Math.max(1, Number((inventoryRow as any).bottle_size_ml ?? 750));
  const restoreMl = bottleSizeMl * quantity;
  const currentStockMlRaw = Number(
    (inventoryRow as any).current_stock_ml ?? safeAvailableQty * bottleSizeMl
  );
  const currentStockMl = Number.isFinite(currentStockMlRaw) ? currentStockMlRaw : safeAvailableQty * bottleSizeMl;
  const nextQty = safeAvailableQty - quantity;
  const nextCurrentMl = Math.max(0, currentStockMl - restoreMl);

  const { error: inventoryUpdateError } = await supabase
    .from('inventory')
    .update({
      stock_quantity: nextQty,
      quantity: nextQty,
      stock: nextQty,
      current_stock_ml: nextCurrentMl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', inventoryId);
  if (inventoryUpdateError) throw inventoryUpdateError;

  const fallbackUnitPriceRaw = Number(item?.unit_price ?? (inventoryRow as any).selling_price ?? (inventoryRow as any).unit_price ?? 0);
  const fallbackUnitPrice = Number.isFinite(fallbackUnitPriceRaw) ? fallbackUnitPriceRaw : 0;
  const fallbackLineTotalRaw = Number(item?.line_total ?? fallbackUnitPrice * quantity);
  const fallbackLineTotal = Number.isFinite(fallbackLineTotalRaw) ? fallbackLineTotalRaw : 0;
  const itemName =
    typeof item?.name === 'string' && item.name.trim().length > 0
      ? item.name.trim()
      : String((inventoryRow as any).item_name ?? (inventoryRow as any).brand_name ?? 'Item');
  const sizeMlRaw = Number(item?.peg_size_ml ?? bottleSizeMl);
  const sizeMl = Number.isFinite(sizeMlRaw) && sizeMlRaw > 0 ? Math.trunc(sizeMlRaw) : bottleSizeMl;

  const { data: insertedSale, error: salesInsertError } = await supabase
    .from('sales')
    .insert([
      {
        item_name: itemName,
        amount: fallbackLineTotal,
        is_voided: false,
        staff_name: authEmail ?? 'staff',
        size_ml: sizeMl,
        quantity,
        unit_price: fallbackUnitPrice,
        line_total: fallbackLineTotal,
        created_at: new Date().toISOString(),
      },
    ])
    .select('id')
    .single();
  if (salesInsertError) {
    // Restore inventory immediately if sales insert fails after deduction.
    await supabase
      .from('inventory')
      .update({
        stock_quantity: safeAvailableQty,
        quantity: safeAvailableQty,
        current_stock_ml: currentStockMl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', inventoryId);
    throw salesInsertError;
  }

  return {
    saleId: insertedSale?.id ? String(insertedSale.id) : null,
    inventoryId,
    restoreQty: quantity,
    restoreMl,
  };
}

async function persistTransactionRecord(options: {
  orderId: string;
  staffName: string;
  totalAmount: number;
  paymentMethod: string;
  items: OrderItemInput[];
}): Promise<string | null> {
  const payload = {
    order_id: options.orderId,
    staff_name: options.staffName,
    total_amount: Number(options.totalAmount.toFixed(2)),
    payment_method: options.paymentMethod,
    items: options.items,
    created_at: new Date().toISOString(),
  };

  const fullInsert = await supabase.from('transactions').upsert([payload], { onConflict: 'order_id' });
  if (!fullInsert.error) return null;

  if (isRelationMissingError(fullInsert.error, 'transactions')) {
    return 'transactions table is missing. Run db/migrations/2026-02-28_add_transactions_table.sql.';
  }

  if (isSchemaCacheMissingColumn(fullInsert.error)) {
    if (isSchemaCacheMissingTable(fullInsert.error, 'transactions')) {
      return 'transactions table is missing in schema cache. Run migration and refresh Supabase schema cache.';
    }
    const fallbackInsert = await supabase
      .from('transactions')
      .upsert(
        [
          {
            order_id: payload.order_id,
            total_amount: payload.total_amount,
            payment_method: payload.payment_method,
            created_at: payload.created_at,
          },
        ],
        { onConflict: 'order_id' }
      );
    if (!fallbackInsert.error) return null;
    if (isSchemaCacheMissingTable(fallbackInsert.error, 'transactions') || isRelationMissingError(fallbackInsert.error, 'transactions')) {
      return 'transactions table is missing. Run db/migrations/2026-02-28_add_transactions_table.sql and retry.';
    }
    throw fallbackInsert.error;
  }

  throw fullInsert.error;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['staff', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const range = parseDateRange(searchParams.get('range'));
    const timezoneOffsetMinutes = parseTimezoneOffset(searchParams.get('tz_offset'));

    if (searchParams.get('range') && !range) {
      return badRequest('range must be one of: today, week, month');
    }

    let query = supabase
      .from('orders')
      .select('order_id, total_amount, created_at, items, staff_name')
      .order('created_at', { ascending: false });

    if (auth.role === 'owner') {
      const staff = searchParams.get('staff');
      if (staff && staff.trim().length > 0) query = query.eq('staff_name', staff.trim());
    }

    if (range) {
      query = query.gte('created_at', rangeStartIsoWithTimezone(range, timezoneOffsetMinutes));
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    return serverError(error, req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['staff', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { items, total, payment_method, paymentMethod, order_id, split_bill } = await req.json();
    const parsedTotal = Number(total);
    const splitBill = split_bill as SplitBillInput | null | undefined;
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

    const normalizedSplitMode =
      splitBill && typeof splitBill.mode === 'string' ? splitBill.mode.trim().toUpperCase() : '';
    const rawSplitEntries = splitBill && Array.isArray(splitBill.entries) ? splitBill.entries : [];
    const splitEntries =
      splitBill && normalizedSplitMode
        ? rawSplitEntries
            .map((entry, index) => ({
              index,
              label: typeof entry?.label === 'string' ? entry.label.trim() : '',
              detail: typeof entry?.detail === 'string' ? entry.detail.trim() : '',
              amount: Number(entry?.amount),
            }))
            .filter((entry) => entry.label.length > 0)
        : [];

    if (splitBill && normalizedSplitMode) {
      if (!SPLIT_MODES.has(normalizedSplitMode)) {
        return badRequest('split_bill.mode must be one of: BY_ITEM, EQUAL, BY_GUEST');
      }
      if (splitEntries.length === 0) {
        return badRequest('split_bill.entries must contain at least one valid split entry');
      }
      if (
        splitEntries.some(
          (entry) => !Number.isFinite(entry.amount) || entry.amount < 0
        )
      ) {
        return badRequest('split_bill.entries amount must be a non-negative number');
      }
    }

    const compensationOps: CompensationOp[] = [];
    try {
      for (const rawItem of items as OrderItemInput[]) {
        const inventoryId = String(rawItem?.inventory_id ?? rawItem?.item_id ?? '').trim();
        const requestedSizeId = typeof rawItem?.inventory_size_id === 'string' ? rawItem.inventory_size_id : '';
        const quantity = Number(rawItem?.quantity ?? 1);
        if (!inventoryId) {
          throw new Error('items[].inventory_id (or item_id) is required');
        }
        if (!Number.isInteger(quantity) || quantity <= 0) {
          throw new Error('items[].quantity must be a positive integer');
        }

        const resolvedSizeId = await resolveInventorySizeId(inventoryId, requestedSizeId);
        const { data: saleRpcData, error: saleRpcError } = await supabase.rpc('create_sale_with_stock', {
          p_inventory_id: inventoryId,
          p_inventory_size_id: resolvedSizeId,
          p_quantity: quantity,
          p_staff_name: auth.user.email ?? 'staff',
        });
        if (!saleRpcError) {
          const saleRpcRow = Array.isArray(saleRpcData) ? saleRpcData[0] : saleRpcData;
          const saleId = saleRpcRow?.sale_id ? String(saleRpcRow.sale_id) : null;
          await syncLegacyInventoryStock(inventoryId);
          const sizeMlFromInput = Number(rawItem?.peg_size_ml ?? 0);
          const restoreMl = (Number.isFinite(sizeMlFromInput) && sizeMlFromInput > 0 ? sizeMlFromInput : 60) * quantity;
          compensationOps.push({
            saleId,
            inventoryId,
            restoreQty: quantity,
            restoreMl,
          });
          continue;
        }

        const rpcMessage =
          saleRpcError && typeof saleRpcError === 'object' && 'message' in saleRpcError
            ? String((saleRpcError as any).message).toLowerCase()
            : String(saleRpcError ?? '').toLowerCase();
        if (rpcMessage.includes('insufficient stock')) {
          throw new Error('Insufficient stock for one or more items.');
        }

        const fallbackOp = await processSaleWithDirectInventoryFallback(rawItem, auth.user.email ?? null);
        compensationOps.push(fallbackOp);
      }
    } catch (stockError) {
      if (compensationOps.length > 0) {
        for (const op of compensationOps) {
          if (op.saleId) {
            await rollbackSaleById(op.saleId);
            continue;
          }
          const { data: inventoryRow } = await supabase
            .from('inventory')
            .select('id, bottle_size_ml, stock_quantity, quantity, current_stock_ml')
            .eq('id', op.inventoryId)
            .maybeSingle();
          if (!inventoryRow) continue;
          const bottleSizeMl = Math.max(1, Number((inventoryRow as any).bottle_size_ml ?? 750));
          const currentQty = Math.max(0, Math.trunc(Number((inventoryRow as any).stock_quantity ?? (inventoryRow as any).quantity ?? 0)));
          const currentMl = Number(
            (inventoryRow as any).current_stock_ml ??
              currentQty * bottleSizeMl
          );
          const safeCurrentMl = Number.isFinite(currentMl) ? currentMl : currentQty * bottleSizeMl;
          const restoredQty = currentQty + op.restoreQty;
          const restoredMl = safeCurrentMl + op.restoreMl;
          await supabase
            .from('inventory')
            .update({
              stock_quantity: restoredQty,
              quantity: restoredQty,
              stock: restoredQty,
              current_stock_ml: restoredMl,
              updated_at: new Date().toISOString(),
            })
            .eq('id', op.inventoryId);
        }
        for (const op of compensationOps) {
          if (!op.saleId) continue;
          await supabase
            .from('sales')
            .update({ is_voided: true, void_reason: 'Order rollback due to stock processing failure' })
            .eq('id', op.saleId);
        }
      }
      throw stockError;
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

    let splitPersistWarning: string | null = null;
    if (splitBill && normalizedSplitMode && splitEntries.length > 0) {
      const splitRows = splitEntries.map((entry) => ({
        order_id: normalizedOrderId,
        split_mode: normalizedSplitMode,
        split_index: entry.index,
        party_label: entry.label,
        party_detail: entry.detail.length > 0 ? entry.detail : null,
        amount: Number(entry.amount.toFixed(2)),
      }));
      const { error: splitError } = await supabase.from('order_splits').insert(splitRows);
      if (splitError) {
        if (isRelationMissingError(splitError, 'order_splits')) {
          splitPersistWarning = 'order_splits table missing. Run split-bill migration.';
        } else {
          throw splitError;
        }
      }
    }

    const txPersistWarning = await persistTransactionRecord({
      orderId: normalizedOrderId,
      staffName: auth.user.email ?? 'staff',
      totalAmount: parsedTotal,
      paymentMethod: normalizedPaymentMethod,
      items: items as OrderItemInput[],
    });

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
        stock_deductions: compensationOps.length,
        split_mode: normalizedSplitMode || null,
        split_entries: splitEntries.length,
        split_warning: splitPersistWarning,
        transaction_warning: txPersistWarning,
      },
      after: orderData,
    });

    const mergedWarning = [splitPersistWarning, txPersistWarning].filter(Boolean).join(' ').trim() || null;

    return NextResponse.json(
      {
        success: true,
        data: orderData,
        warning: mergedWarning,
        stock_updates: compensationOps.length,
      },
      { status: 201 }
    );
  } catch (error) {
    return serverError(error, req);
  }
}

