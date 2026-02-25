import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { serverError } from '@/lib/api-response';
import {
  aggregateDailyRevenue,
  aggregateMonthlyRevenue,
  aggregateTopItemsFromOrders,
  currentMonthUtcRange,
  currentYearUtcRange,
  parseTimezoneOffset,
} from '@/lib/order-analytics';

type OrderRow = {
  id: number;
  order_id: string;
  total_amount: number | string;
  payment_method: string | null;
  created_at: string;
  items: unknown;
};

type OrderItemRow = {
  item_id: string | number | null;
  quantity: number | string | null;
  order_id: string | number | null;
  created_at?: string | null;
};

type ItemAggregate = {
  item_id: string;
  total_quantity: number;
  item_name: string | null;
};

function asNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function aggregateTopItemFromOrderJson(currentMonthOrders: OrderRow[]): ItemAggregate | null {
  const top = aggregateTopItemsFromOrders(currentMonthOrders)[0];
  if (!top) return null;
  return {
    item_id: top.item_id,
    total_quantity: top.count,
    item_name: top.item_name ?? null,
  };
}

function aggregateTopItemFromRows(orderItems: OrderItemRow[]): ItemAggregate | null {
  const quantityByItem = new Map<string, number>();

  for (const row of orderItems) {
    const itemId = row.item_id === null || row.item_id === undefined ? '' : String(row.item_id);
    if (!itemId) continue;
    const qty = asNumber(row.quantity);
    if (qty <= 0) continue;
    quantityByItem.set(itemId, (quantityByItem.get(itemId) ?? 0) + qty);
  }

  let top: ItemAggregate | null = null;
  for (const [item_id, total_quantity] of Array.from(quantityByItem.entries())) {
    if (!top || total_quantity > top.total_quantity) {
      top = { item_id, total_quantity, item_name: null };
    }
  }

  return top;
}

function buildItemNameMapFromOrders(currentMonthOrders: OrderRow[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const order of currentMonthOrders) {
    if (!Array.isArray(order.items)) continue;
    for (const row of order.items) {
      const item = row as Record<string, unknown>;
      const rawId = item.item_id ?? item.id;
      const itemId = rawId === undefined || rawId === null ? '' : String(rawId);
      const rawName = item.name;
      const itemName = typeof rawName === 'string' ? rawName.trim() : '';
      if (itemId && itemName && !names.has(itemId)) {
        names.set(itemId, itemName);
      }
    }
  }
  return names;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['owner']);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const timezoneOffsetMinutes = parseTimezoneOffset(searchParams.get('tz_offset'));
    const monthRange = currentMonthUtcRange(timezoneOffsetMinutes);
    const yearRange = currentYearUtcRange(timezoneOffsetMinutes);

    const { data: yearOrdersRaw, error: yearOrdersError } = await supabase
      .from('orders')
      .select('id, order_id, total_amount, payment_method, created_at, items')
      .gte('created_at', yearRange.startIso)
      .lt('created_at', yearRange.endIso)
      .order('created_at', { ascending: true });

    if (yearOrdersError) throw yearOrdersError;

    const yearOrders = (yearOrdersRaw ?? []) as OrderRow[];
    const currentMonthOrders = yearOrders.filter((row) => {
      const createdAt = row.created_at;
      return createdAt >= monthRange.startIso && createdAt < monthRange.endIso;
    });

    const totalSales = currentMonthOrders.reduce((sum, order) => sum + asNumber(order.total_amount), 0);
    const totalOrders = currentMonthOrders.length;
    const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

    const paymentMap = new Map<string, number>();
    for (const order of currentMonthOrders) {
      const method = (order.payment_method ?? 'UNKNOWN').toUpperCase();
      paymentMap.set(method, (paymentMap.get(method) ?? 0) + asNumber(order.total_amount));
    }
    const paymentBreakdown = Array.from(paymentMap.entries()).map(([payment_method, total_amount]) => ({
      payment_method,
      total_amount: Number(total_amount.toFixed(2)),
    }));

    const dailyRevenue = aggregateDailyRevenue(currentMonthOrders, timezoneOffsetMinutes);
    const monthlySales = aggregateMonthlyRevenue(yearOrders, timezoneOffsetMinutes);

    const itemNameMap = buildItemNameMapFromOrders(currentMonthOrders);
    let topSellingItem: ItemAggregate | null = null;
    const currentMonthOrderIds = currentMonthOrders.map((o) => o.order_id).filter((v) => Boolean(v));
    const currentMonthNumericOrderIds = currentMonthOrders
      .map((o) => o.id)
      .filter((v) => Number.isFinite(v))
      .map((v) => String(v));

    const orderIdsForFilter = Array.from(new Set(currentMonthOrderIds.concat(currentMonthNumericOrderIds)));

    if (orderIdsForFilter.length > 0) {
      const { data: orderItemsByOrderIdRaw, error: orderItemsByOrderIdError } = await supabase
        .from('order_items')
        .select('item_id, quantity, order_id')
        .in('order_id', orderIdsForFilter);

      if (!orderItemsByOrderIdError && Array.isArray(orderItemsByOrderIdRaw)) {
        topSellingItem = aggregateTopItemFromRows(orderItemsByOrderIdRaw as OrderItemRow[]);
      } else {
        const { data: orderItemsByDateRaw, error: orderItemsByDateError } = await supabase
          .from('order_items')
          .select('item_id, quantity, created_at')
          .gte('created_at', monthRange.startIso)
          .lt('created_at', monthRange.endIso);

        if (!orderItemsByDateError && Array.isArray(orderItemsByDateRaw)) {
          topSellingItem = aggregateTopItemFromRows(orderItemsByDateRaw as OrderItemRow[]);
        }
      }
    }

    if (!topSellingItem) {
      topSellingItem = aggregateTopItemFromOrderJson(currentMonthOrders);
    }

    if (topSellingItem) {
      const mappedName = itemNameMap.get(topSellingItem.item_id);
      if (mappedName) {
        topSellingItem.item_name = mappedName;
      } else if (/^\d+$/.test(topSellingItem.item_id)) {
        const numericId = Number(topSellingItem.item_id);
        const { data: inventoryRows, error: inventoryError } = await supabase
          .from('inventory')
          .select('id, item_name')
          .eq('id', numericId)
          .limit(1);
        if (!inventoryError && Array.isArray(inventoryRows) && inventoryRows.length > 0) {
          const row = inventoryRows[0] as { item_name?: unknown };
          const invName = typeof row.item_name === 'string' ? row.item_name.trim() : '';
          if (invName) {
            topSellingItem.item_name = invName;
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        monthlyOverview: {
          total_sales: Number(totalSales.toFixed(2)),
          total_orders: totalOrders,
          average_order_value: Number(averageOrderValue.toFixed(2)),
        },
        paymentBreakdown,
        dailyRevenue,
        monthlySales,
        topSellingItem,
      },
    });
  } catch (error) {
    return serverError(error, req);
  }
}
