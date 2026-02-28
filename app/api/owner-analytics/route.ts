import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { badRequest, serverError } from '@/lib/api-response';
import {
  aggregateDailyRevenue,
  aggregateMonthlyRevenue,
  aggregateTopItemsFromOrders,
  currentMonthUtcRange,
  currentYearUtcRange,
  parseTimezoneOffset,
} from '@/lib/order-analytics';
import { getLatestMonthClosureCutoffIso, maxIso } from '@/lib/month-closure';
import { loadAnalyticsOrdersRange } from '@/lib/analytics-orders-source';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type OrderRow = {
  id: string | number;
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

type StockRegisterSummary = {
  total_bottles_sold: number;
  total_revenue: number;
  current_remaining_stock: number;
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

function resolveMonthSelection(rawMonth: string | null) {
  if (!rawMonth) return null;
  const trimmed = rawMonth.trim();
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(trimmed);
  if (!match) return null;
  return {
    monthKey: trimmed,
    year: Number(match[1]),
    monthIndex: Number(match[2]) - 1,
  };
}

function selectedMonthUtcRange(timezoneOffsetMinutes: number, year: number, monthIndex: number) {
  const localStartAsUtcMs = Date.UTC(year, monthIndex, 1, 0, 0, 0, 0);
  const localEndAsUtcMs = Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0);
  return {
    startIso: new Date(localStartAsUtcMs + timezoneOffsetMinutes * 60_000).toISOString(),
    endIso: new Date(localEndAsUtcMs + timezoneOffsetMinutes * 60_000).toISOString(),
  };
}

function normalizeOrderItems(items: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(items)) return items as Array<Record<string, unknown>>;
  if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function aggregateStockSummaryFromOrders(currentMonthOrders: OrderRow[]): Pick<StockRegisterSummary, 'total_bottles_sold' | 'total_revenue'> {
  let totalBottlesSold = 0;
  let totalRevenue = 0;

  for (const order of currentMonthOrders) {
    const items = normalizeOrderItems(order.items);
    for (const item of items) {
      const qty = asNumber(item.quantity);
      if (qty <= 0) continue;
      totalBottlesSold += qty;

      const lineTotal = asNumber(item.line_total);
      if (lineTotal > 0) {
        totalRevenue += lineTotal;
      } else {
        totalRevenue += asNumber(item.unit_price) * qty;
      }
    }
  }

  return {
    total_bottles_sold: Number(totalBottlesSold.toFixed(2)),
    total_revenue: Number(totalRevenue.toFixed(2)),
  };
}

async function loadCurrentRemainingStock(): Promise<number> {
  const { data, error } = await supabase
    .from('inventory')
    .select('stock_quantity, quantity');

  if (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (message.includes('inventory') && message.includes('does not exist')) return 0;
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  const remaining = rows.reduce((sum, row: any) => {
    const stock = asNumber(row?.stock_quantity ?? row?.quantity);
    return sum + stock;
  }, 0);
  return Number(remaining.toFixed(2));
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['owner']);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const timezoneOffsetMinutes = parseTimezoneOffset(searchParams.get('tz_offset'));
    const selectedMonth = resolveMonthSelection(searchParams.get('month'));
    if (searchParams.get('month') && !selectedMonth) {
      return badRequest('month must be in YYYY-MM format');
    }
    const showArchived = searchParams.get('show_archived') === 'true';
    const monthRange = selectedMonth
      ? selectedMonthUtcRange(timezoneOffsetMinutes, selectedMonth.year, selectedMonth.monthIndex)
      : currentMonthUtcRange(timezoneOffsetMinutes);
    const yearAnchor = selectedMonth
      ? new Date(Date.UTC(selectedMonth.year, selectedMonth.monthIndex, 15))
      : new Date();
    const yearRange = currentYearUtcRange(timezoneOffsetMinutes, yearAnchor);
    const closureCutoffIso = await getLatestMonthClosureCutoffIso();
    const effectiveYearStartIso =
      !showArchived && closureCutoffIso ? maxIso(yearRange.startIso, closureCutoffIso) : yearRange.startIso;
    const boundedYearStartIso = effectiveYearStartIso < yearRange.endIso ? effectiveYearStartIso : yearRange.startIso;

    const yearOrders = (await loadAnalyticsOrdersRange(boundedYearStartIso, yearRange.endIso)) as OrderRow[];
    if (yearOrders.length === 0) {
      const { data: yearSalesRaw, error: yearSalesError } = await supabase
        .from('sales')
        .select('item_name, amount, line_total, created_at, is_voided')
        .gte('created_at', boundedYearStartIso)
        .lt('created_at', yearRange.endIso)
        .order('created_at', { ascending: true });
      if (yearSalesError) throw yearSalesError;

      const yearSalesRows = (Array.isArray(yearSalesRaw) ? yearSalesRaw : []).filter((row: any) => !row?.is_voided);
      const pseudoOrders: OrderRow[] = yearSalesRows.map((row: any, index: number) => {
        const itemName = typeof row.item_name === 'string' && row.item_name.trim().length > 0
          ? row.item_name.trim()
          : 'Item';
        const amount = asNumber(row.amount ?? row.line_total);
        return {
          id: index + 1,
          order_id: `legacy-sales-${index + 1}`,
          total_amount: amount,
          payment_method: 'UNKNOWN',
          created_at: String(row.created_at ?? ''),
          items: [
            {
              item_id: itemName,
              item_name: itemName,
              name: itemName,
              quantity: 1,
              line_total: amount,
            },
          ],
        };
      });

      const currentMonthOrders = pseudoOrders.filter((row) => {
        const createdAt = row.created_at;
        return createdAt >= monthRange.startIso && createdAt < monthRange.endIso;
      });

      const totalSales = currentMonthOrders.reduce((sum, order) => sum + asNumber(order.total_amount), 0);
      const totalOrders = currentMonthOrders.length;
      const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
      const dailyRevenue = aggregateDailyRevenue(currentMonthOrders, timezoneOffsetMinutes);
      const monthlySales = aggregateMonthlyRevenue(pseudoOrders, timezoneOffsetMinutes);
      const topLegacy = aggregateTopItemsFromOrders(currentMonthOrders)[0];
      const stockSummary = aggregateStockSummaryFromOrders(currentMonthOrders);
      const remainingStock = await loadCurrentRemainingStock();

      return NextResponse.json({
        success: true,
        data: {
          monthlyOverview: {
            total_sales: Number(totalSales.toFixed(2)),
            total_orders: totalOrders,
            average_order_value: Number(averageOrderValue.toFixed(2)),
          },
          paymentBreakdown: totalSales > 0 ? [{ payment_method: 'UNKNOWN', total_amount: Number(totalSales.toFixed(2)) }] : [],
          dailyRevenue,
          monthlySales,
          topSellingItem: topLegacy
            ? {
                item_id: topLegacy.item_id,
                total_quantity: topLegacy.count,
                item_name: topLegacy.item_name,
              }
            : null,
          selectedMonth: selectedMonth?.monthKey ?? null,
          stockRegisterSummary: {
            ...stockSummary,
            current_remaining_stock: remainingStock,
          },
        },
      });
    }

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
    const stockSummary = aggregateStockSummaryFromOrders(currentMonthOrders);
    const remainingStock = await loadCurrentRemainingStock();

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
        selectedMonth: selectedMonth?.monthKey ?? null,
        stockRegisterSummary: {
          ...stockSummary,
          current_remaining_stock: remainingStock,
        },
      },
    });
  } catch (error) {
    return serverError(error, req);
  }
}
