import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { serverError } from '@/lib/api-response';
import {
  aggregateTopItemsFromOrders,
  currentDayUtcRange,
  currentMonthUtcRange,
  parseTimezoneOffset,
  type OrderAnalyticsRow,
} from '@/lib/order-analytics';
import { getLatestMonthClosureCutoffIso, maxIso } from '@/lib/month-closure';
import { loadAnalyticsOrdersRange } from '@/lib/analytics-orders-source';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['owner']);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') === 'month' ? 'month' : 'today';
    const timezoneOffsetMinutes = parseTimezoneOffset(searchParams.get('tz_offset'));
    const bounds =
      range === 'month'
        ? currentMonthUtcRange(timezoneOffsetMinutes)
        : currentDayUtcRange(timezoneOffsetMinutes);
    const closureCutoffIso = await getLatestMonthClosureCutoffIso();
    const effectiveStartIso = closureCutoffIso ? maxIso(bounds.startIso, closureCutoffIso) : bounds.startIso;
    const boundedStartIso = effectiveStartIso < bounds.endIso ? effectiveStartIso : bounds.startIso;

    const orders = (await loadAnalyticsOrdersRange(boundedStartIso, bounds.endIso)) as OrderAnalyticsRow[];

    const totalSales = orders.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
    const totalOrders = orders.length;
    const topItems = aggregateTopItemsFromOrders(orders).slice(0, 5);

    let lowStockItems: number | null = null;
    if (auth.role === 'owner') {
      const { data: inventoryRows, error: inventoryError } = await supabase
        .from('inventory')
        .select('stock_quantity, quantity, low_stock_alert');
      if (inventoryError) throw inventoryError;
      const inventory = Array.isArray(inventoryRows) ? inventoryRows : [];
      lowStockItems = inventory.filter((row: any) => {
        const stock = Number(row?.stock_quantity ?? row?.quantity ?? 0);
        const thresholdRaw = Number(row?.low_stock_alert ?? 5);
        const threshold = Number.isFinite(thresholdRaw) && thresholdRaw >= 0 ? Math.trunc(thresholdRaw) : 5;
        return stock < threshold;
      }).length;
    }

    return NextResponse.json({
      success: true,
      data: {
        totalSales: Number(totalSales.toFixed(2)),
        totalOrders,
        topItems,
        lowStockItems,
      },
    });
  } catch (error) {
    return serverError(error, req);
  }
}
