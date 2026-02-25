import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { badRequest, serverError } from '@/lib/api-response';
import {
  aggregateTopItemsFromOrders,
  currentDayUtcRange,
  currentMonthUtcRange,
  parseTimezoneOffset,
  type OrderAnalyticsRow,
} from '@/lib/order-analytics';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['staff', 'manager', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') === 'month' ? 'month' : 'today';
    const timezoneOffsetMinutes = parseTimezoneOffset(searchParams.get('tz_offset'));
    const bounds =
      range === 'month'
        ? currentMonthUtcRange(timezoneOffsetMinutes)
        : currentDayUtcRange(timezoneOffsetMinutes);

    const { data: ordersRaw, error: ordersError } = await supabase
      .from('orders')
      .select('total_amount, created_at, items')
      .gte('created_at', bounds.startIso)
      .lt('created_at', bounds.endIso)
      .order('created_at', { ascending: false });

    if (ordersError) throw ordersError;
    const orders = (ordersRaw ?? []) as OrderAnalyticsRow[];
    const totalSales = orders.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
    const totalOrders = orders.length;
    const topItems = aggregateTopItemsFromOrders(orders).slice(0, 5);

    let lowStockItems: number | null = null;
    if (auth.role === 'owner') {
      const { data: inventoryRows, error: inventoryError } = await supabase
        .from('inventory')
        .select('quantity');
      if (inventoryError) throw inventoryError;
      const inventory = Array.isArray(inventoryRows) ? inventoryRows : [];
      lowStockItems = inventory.filter((row: any) => Number(row.quantity) <= 5).length;
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

