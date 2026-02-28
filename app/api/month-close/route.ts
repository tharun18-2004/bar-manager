import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { badRequest, serverError } from '@/lib/api-response';
import { supabase } from '@/lib/supabase';
import { aggregateTopItemsFromOrders, currentMonthUtcRange, parseTimezoneOffset, type OrderAnalyticsRow } from '@/lib/order-analytics';
import { writeAuditEvent } from '@/lib/audit-log';

function getMonthKey(timezoneOffsetMinutes: number) {
  const localLikeNow = new Date(Date.now() - timezoneOffsetMinutes * 60_000);
  const y = localLikeNow.getUTCFullYear();
  const m = String(localLikeNow.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['owner']);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json().catch(() => ({}));
    const timezoneOffsetMinutes = parseTimezoneOffset(
      typeof body?.tz_offset === 'string' || typeof body?.tz_offset === 'number'
        ? String(body.tz_offset)
        : null
    );
    const monthKey = getMonthKey(timezoneOffsetMinutes);
    const bounds = currentMonthUtcRange(timezoneOffsetMinutes);

    const { data: existingRows, error: existingError } = await supabase
      .from('month_closures')
      .select('*')
      .eq('month_key', monthKey)
      .limit(1);
    if (existingError) throw existingError;
    if (Array.isArray(existingRows) && existingRows.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Month ${monthKey} is already closed.`,
          data: existingRows[0],
        },
        { status: 409 }
      );
    }

    const nowIso = new Date().toISOString();
    const { data: cancelledTabs, error: cancelTabsError } = await supabase
      .from('tabs')
      .update({
        status: 'cancelled',
        closed_at: nowIso,
        updated_at: nowIso,
      })
      .eq('status', 'open')
      .select('id, total_amount');
    if (cancelTabsError) throw cancelTabsError;

    const cancelledOpenTabsCount = Array.isArray(cancelledTabs) ? cancelledTabs.length : 0;
    const cancelledOpenTabsAmount = Array.isArray(cancelledTabs)
      ? cancelledTabs.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0)
      : 0;

    const { data: ordersRows, error: ordersError } = await supabase
      .from('orders')
      .select('order_id, total_amount, created_at, items')
      .gte('created_at', bounds.startIso)
      .lt('created_at', bounds.endIso)
      .order('created_at', { ascending: false });
    if (ordersError) throw ordersError;

    const orders = (ordersRows ?? []) as Array<OrderAnalyticsRow & { order_id?: string }>;
    const totalSales = orders.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
    const totalOrders = orders.length;
    const topItem = aggregateTopItemsFromOrders(orders)[0];

    const closureRow = {
      month_key: monthKey,
      period_start: bounds.startIso,
      period_end: bounds.endIso,
      total_sales: Number(totalSales.toFixed(2)),
      total_orders: totalOrders,
      top_item_name: topItem?.item_name ?? null,
      top_item_quantity: Number(topItem?.count ?? 0),
      cancelled_open_tabs_count: cancelledOpenTabsCount,
      cancelled_open_tabs_amount: Number(cancelledOpenTabsAmount.toFixed(2)),
      closed_by_user_id: auth.user.id,
      closed_by_email: auth.user.email ?? null,
      metadata: {
        top_item_id: topItem?.item_id ?? null,
        timezone_offset_minutes: timezoneOffsetMinutes,
      },
    };

    const { data: insertedClosure, error: insertClosureError } = await supabase
      .from('month_closures')
      .insert([closureRow])
      .select()
      .single();
    if (insertClosureError) throw insertClosureError;

    await writeAuditEvent({
      req,
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      actorRole: auth.role,
      action: 'month.close',
      resource: 'month_closures',
      resourceId: insertedClosure?.id ?? null,
      metadata: {
        month_key: monthKey,
        total_sales: closureRow.total_sales,
        total_orders: closureRow.total_orders,
        cancelled_open_tabs_count: closureRow.cancelled_open_tabs_count,
      },
      after: insertedClosure,
    });

    return NextResponse.json({
      success: true,
      data: insertedClosure,
      message: `Month ${monthKey} closed successfully.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('relation') && message.includes('month_closures')) {
      return badRequest('month_closures table is missing. Run the month closure migration first.');
    }
    return serverError(error, req);
  }
}
