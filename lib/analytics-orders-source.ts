import { supabase } from '@/lib/supabase';

export type AnalyticsOrderRow = {
  id: string | number;
  order_id: string;
  total_amount: number;
  payment_method: string | null;
  created_at: string;
  items: unknown;
};

function asNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function isRelationMissingError(error: unknown, relation: string) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes(relation) && message.includes('does not exist');
}

function isSchemaCacheError(error: unknown, relation: string) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes(relation) && message.includes('schema cache');
}

function mapRowsToOrders(rows: any[]): AnalyticsOrderRow[] {
  return rows.map((row: any, index: number) => {
    const rawOrderId = row?.order_id ?? row?.external_order_id ?? row?.id ?? `row-${index + 1}`;
    const paymentMethodRaw = row?.payment_method;
    const paymentMethod =
      typeof paymentMethodRaw === 'string' && paymentMethodRaw.trim().length > 0
        ? paymentMethodRaw.trim().toUpperCase()
        : 'UNKNOWN';
    return {
      id: row?.id ?? index + 1,
      order_id: String(rawOrderId),
      total_amount: asNumber(row?.total_amount ?? row?.amount),
      payment_method: paymentMethod,
      created_at: String(row?.created_at ?? ''),
      items: row?.items ?? [],
    };
  });
}

export async function loadAnalyticsOrdersRange(startIso: string, endIso: string): Promise<AnalyticsOrderRow[]> {
  let transactionRows: AnalyticsOrderRow[] = [];
  let canUseOrdersSource = true;

  try {
    const txResult = await supabase
      .from('transactions')
      .select('id, order_id, total_amount, payment_method, created_at, items')
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: true });
    if (!txResult.error) {
      const rows = Array.isArray(txResult.data) ? txResult.data : [];
      if (rows.length > 0) transactionRows = mapRowsToOrders(rows);
    } else if (!isRelationMissingError(txResult.error, 'transactions') && !isSchemaCacheError(txResult.error, 'transactions')) {
      throw txResult.error;
    }
  } catch (error) {
    if (!isRelationMissingError(error, 'transactions') && !isSchemaCacheError(error, 'transactions')) {
      throw error;
    }
  }

  let orderRowsMapped: AnalyticsOrderRow[] = [];
  if (canUseOrdersSource) {
    const ordersResult = await supabase
      .from('orders')
      .select('id, order_id, total_amount, payment_method, created_at, items')
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: true });
    if (ordersResult.error) throw ordersResult.error;
    const orderRows = Array.isArray(ordersResult.data) ? ordersResult.data : [];
    if (orderRows.length > 0) orderRowsMapped = mapRowsToOrders(orderRows);
  }

  if (transactionRows.length > 0 || orderRowsMapped.length > 0) {
    // Combine sources so historical orders remain visible even before transactions backfill.
    const merged = new Map<string, AnalyticsOrderRow>();
    for (const row of orderRowsMapped) {
      merged.set(row.order_id, row);
    }
    for (const row of transactionRows) {
      merged.set(row.order_id, row);
    }
    return Array.from(merged.values()).sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  const salesResult = await supabase
    .from('sales')
    .select('id, item_name, amount, line_total, quantity, unit_price, created_at, is_voided')
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: true });
  if (salesResult.error) throw salesResult.error;

  const salesRows = (Array.isArray(salesResult.data) ? salesResult.data : []).filter((row: any) => !row?.is_voided);
  return salesRows.map((row: any, index: number) => {
    const itemName = typeof row?.item_name === 'string' && row.item_name.trim().length > 0 ? row.item_name.trim() : 'Item';
    const quantity = Math.max(1, Math.trunc(asNumber(row?.quantity ?? 1)));
    const lineTotal = asNumber(row?.line_total ?? row?.amount);
    const unitPrice = quantity > 0 ? lineTotal / quantity : asNumber(row?.unit_price ?? 0);

    return {
      id: row?.id ?? index + 1,
      order_id: `legacy-sales-${row?.id ?? index + 1}`,
      total_amount: lineTotal,
      payment_method: 'UNKNOWN',
      created_at: String(row?.created_at ?? ''),
      items: [
        {
          item_id: itemName,
          item_name: itemName,
          name: itemName,
          quantity,
          unit_price: Number(unitPrice.toFixed(2)),
          line_total: Number(lineTotal.toFixed(2)),
        },
      ],
    };
  });
}
