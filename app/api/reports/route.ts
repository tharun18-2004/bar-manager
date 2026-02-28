import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getWeeklyInsights } from '@/lib/gemini';
import { requireAuth } from '@/lib/api-auth';
import { badRequest, parseDateRange, serverError } from '@/lib/api-response';
import { getLatestMonthClosureCutoffIso, maxIso } from '@/lib/month-closure';
import {
  aggregateTopItemsFromOrders,
  currentDayUtcRange,
  currentMonthUtcRange,
  parseTimezoneOffset,
  type OrderAnalyticsRow,
} from '@/lib/order-analytics';
import { loadAnalyticsOrdersRange } from '@/lib/analytics-orders-source';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function rangeBoundsWithTimezone(
  range: 'today' | 'week' | 'month',
  timezoneOffsetMinutes: number
): { startIso: string; endIso: string } {
  const nowIso = new Date().toISOString();
  if (range === 'today') {
    const day = currentDayUtcRange(timezoneOffsetMinutes);
    return { startIso: day.startIso, endIso: nowIso };
  }
  if (range === 'month') {
    const month = currentMonthUtcRange(timezoneOffsetMinutes);
    return { startIso: month.startIso, endIso: nowIso };
  }
  const day = currentDayUtcRange(timezoneOffsetMinutes);
  const weekStart = new Date(day.startIso);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  return { startIso: weekStart.toISOString(), endIso: nowIso };
}

// Calculate aggregated sales data with date filtering
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['owner']);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const range = parseDateRange(searchParams.get('range'));
    if (!range) {
      return badRequest("range must be one of: today, week, month");
    }
    const timezoneOffsetMinutes = parseTimezoneOffset(searchParams.get('tz_offset'));
    const closureCutoffIso = await getLatestMonthClosureCutoffIso();
    const bounds = rangeBoundsWithTimezone(range, timezoneOffsetMinutes);
    const baseStartIso = bounds.startIso;
    const effectiveStartIso = closureCutoffIso ? maxIso(baseStartIso, closureCutoffIso) : baseStartIso;
    const endIso = bounds.endIso;

    let orders = (await loadAnalyticsOrdersRange(effectiveStartIso, endIso)) as OrderAnalyticsRow[];
    if (orders.length === 0 && effectiveStartIso !== baseStartIso) {
      orders = (await loadAnalyticsOrdersRange(baseStartIso, endIso)) as OrderAnalyticsRow[];
    }

    const totalRevenue = orders.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
    const totalTransactions = orders.length;
    const topItems = aggregateTopItemsFromOrders(orders).slice(0, 5).map((item) => ({
      name: item.item_name,
      count: item.count,
      revenue: Number(item.revenue.toFixed(2)),
    }));

    let totalVoided = 0;
    try {
      const { data: voidRows, error: voidError } = await supabase
        .from('void_logs')
        .select('id')
        .gte('created_at', effectiveStartIso)
        .lte('created_at', endIso);
      if (voidError) throw voidError;
      totalVoided = Array.isArray(voidRows) ? voidRows.length : 0;
    } catch {
      totalVoided = 0;
    }

    const { data: inventoryData, error: inventoryError } = await supabase
      .from('inventory')
      .select('*');
    if (inventoryError) throw inventoryError;

    const insightRows: Array<Record<string, unknown>> = [];
    orders.forEach((order: any) => {
      const createdAt = String(order?.created_at ?? new Date().toISOString());
      const items = Array.isArray(order?.items) ? order.items : [];
      if (items.length === 0) {
        insightRows.push({
          id: String(order?.order_id ?? order?.id ?? ''),
          item_name: 'Order',
          amount: Number(order?.total_amount ?? 0),
          created_at: createdAt,
          is_voided: false,
        });
        return;
      }
      items.forEach((item: any, index: number) => {
        const qtyRaw = Number(item?.quantity ?? 1);
        const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
        const lineTotalRaw = Number(item?.line_total ?? Number(item?.unit_price ?? 0) * qty);
        const amount = Number.isFinite(lineTotalRaw) ? lineTotalRaw : 0;
        insightRows.push({
          id: `${String(order?.order_id ?? order?.id ?? 'order')}-${index + 1}`,
          item_name: String(item?.name ?? item?.item_name ?? 'Item'),
          amount,
          created_at: createdAt,
          is_voided: false,
        });
      });
    });

    const insights = await getWeeklyInsights(insightRows, inventoryData);

    return NextResponse.json({
      success: true,
      data: {
        total_revenue: Number(totalRevenue.toFixed(2)),
        total_transactions: totalTransactions,
        total_voided: totalVoided,
        avg_transaction: totalTransactions > 0 ? Number((totalRevenue / totalTransactions).toFixed(2)) : 0,
        top_items: topItems,
      },
      insights,
    });
  } catch (error) {
    return serverError(error, req);
  }
}

