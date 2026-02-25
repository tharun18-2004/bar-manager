import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { serverError } from '@/lib/api-response';

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
};

function isoStartOfMonth(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

function isoStartOfNextMonth(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
}

function isoStartOfYear(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1)).toISOString();
}

function isoStartOfNextYear(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear() + 1, 0, 1)).toISOString();
}

function asNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function monthLabel(monthIndex: number): string {
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][monthIndex] ?? '';
}

function aggregateTopItemFromOrderJson(currentMonthOrders: OrderRow[]): ItemAggregate | null {
  const quantityByItem = new Map<string, number>();

  for (const order of currentMonthOrders) {
    if (!Array.isArray(order.items)) continue;
    for (const row of order.items) {
      const item = row as Record<string, unknown>;
      const rawId = item.item_id ?? item.id ?? item.name;
      const itemId = rawId === undefined || rawId === null ? '' : String(rawId);
      if (!itemId) continue;
      const qty = asNumber(item.quantity);
      if (qty <= 0) continue;
      quantityByItem.set(itemId, (quantityByItem.get(itemId) ?? 0) + qty);
    }
  }

  let top: ItemAggregate | null = null;
  for (const [item_id, total_quantity] of Array.from(quantityByItem.entries())) {
    if (!top || total_quantity > top.total_quantity) {
      top = { item_id, total_quantity };
    }
  }

  return top;
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
      top = { item_id, total_quantity };
    }
  }

  return top;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['owner']);
    if (auth instanceof NextResponse) return auth;

    const now = new Date();
    const monthStartIso = isoStartOfMonth(now);
    const nextMonthStartIso = isoStartOfNextMonth(now);
    const yearStartIso = isoStartOfYear(now);
    const nextYearStartIso = isoStartOfNextYear(now);

    const { data: yearOrdersRaw, error: yearOrdersError } = await supabase
      .from('orders')
      .select('id, order_id, total_amount, payment_method, created_at, items')
      .gte('created_at', yearStartIso)
      .lt('created_at', nextYearStartIso)
      .order('created_at', { ascending: true });

    if (yearOrdersError) throw yearOrdersError;

    const yearOrders = (yearOrdersRaw ?? []) as OrderRow[];
    const currentMonthOrders = yearOrders.filter((row) => {
      const createdAt = row.created_at;
      return createdAt >= monthStartIso && createdAt < nextMonthStartIso;
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

    const dailyRevenueMap = new Map<string, number>();
    for (const order of currentMonthOrders) {
      const day = order.created_at.slice(0, 10);
      dailyRevenueMap.set(day, (dailyRevenueMap.get(day) ?? 0) + asNumber(order.total_amount));
    }
    const dailyRevenue = Array.from(dailyRevenueMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, total_amount]) => ({ date, total_amount: Number(total_amount.toFixed(2)) }));

    const monthlyRevenueTotals = new Array<number>(12).fill(0);
    for (const order of yearOrders) {
      const monthIndex = new Date(order.created_at).getUTCMonth();
      monthlyRevenueTotals[monthIndex] += asNumber(order.total_amount);
    }
    const monthlySales = monthlyRevenueTotals.map((total_amount, monthIndex) => ({
      month: monthLabel(monthIndex),
      total_amount: Number(total_amount.toFixed(2)),
    }));

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
          .gte('created_at', monthStartIso)
          .lt('created_at', nextMonthStartIso);

        if (!orderItemsByDateError && Array.isArray(orderItemsByDateRaw)) {
          topSellingItem = aggregateTopItemFromRows(orderItemsByDateRaw as OrderItemRow[]);
        }
      }
    }

    if (!topSellingItem) {
      topSellingItem = aggregateTopItemFromOrderJson(currentMonthOrders);
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
