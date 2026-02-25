export type OrderAnalyticsRow = {
  total_amount: number | string;
  created_at: string;
  items: unknown;
};

export type TopItem = {
  item_id: string;
  item_name: string;
  count: number;
  revenue: number;
};

function clampTimezoneOffset(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-840, Math.min(840, Math.trunc(value)));
}

export function parseTimezoneOffset(raw: string | null): number {
  return clampTimezoneOffset(Number(raw ?? '0'));
}

function toUtcIsoFromLocalParts(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timezoneOffsetMinutes: number
): string {
  const localAsUtcMs = Date.UTC(year, monthIndex, day, hour, minute, second, ms);
  return new Date(localAsUtcMs + timezoneOffsetMinutes * 60_000).toISOString();
}

function localNowFromOffset(now: Date, timezoneOffsetMinutes: number): Date {
  // Shift UTC "now" into a stable pseudo-local timeline for date component extraction.
  return new Date(now.getTime() - timezoneOffsetMinutes * 60_000);
}

export function currentMonthUtcRange(timezoneOffsetMinutes: number, now = new Date()) {
  const localNow = localNowFromOffset(now, timezoneOffsetMinutes);
  const y = localNow.getUTCFullYear();
  const m = localNow.getUTCMonth();

  return {
    startIso: toUtcIsoFromLocalParts(y, m, 1, 0, 0, 0, 0, timezoneOffsetMinutes),
    endIso: toUtcIsoFromLocalParts(y, m + 1, 1, 0, 0, 0, 0, timezoneOffsetMinutes),
  };
}

export function currentDayUtcRange(timezoneOffsetMinutes: number, now = new Date()) {
  const localNow = localNowFromOffset(now, timezoneOffsetMinutes);
  const y = localNow.getUTCFullYear();
  const m = localNow.getUTCMonth();
  const d = localNow.getUTCDate();

  return {
    startIso: toUtcIsoFromLocalParts(y, m, d, 0, 0, 0, 0, timezoneOffsetMinutes),
    endIso: toUtcIsoFromLocalParts(y, m, d + 1, 0, 0, 0, 0, timezoneOffsetMinutes),
  };
}

export function currentYearUtcRange(timezoneOffsetMinutes: number, now = new Date()) {
  const localNow = localNowFromOffset(now, timezoneOffsetMinutes);
  const y = localNow.getUTCFullYear();

  return {
    startIso: toUtcIsoFromLocalParts(y, 0, 1, 0, 0, 0, 0, timezoneOffsetMinutes),
    endIso: toUtcIsoFromLocalParts(y + 1, 0, 1, 0, 0, 0, 0, timezoneOffsetMinutes),
  };
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function dayLabelFromIso(isoString: string, timezoneOffsetMinutes: number): string {
  const localLike = new Date(new Date(isoString).getTime() - timezoneOffsetMinutes * 60_000);
  return localLike.toISOString().slice(0, 10);
}

function monthIndexFromIso(isoString: string, timezoneOffsetMinutes: number): number {
  const localLike = new Date(new Date(isoString).getTime() - timezoneOffsetMinutes * 60_000);
  return localLike.getUTCMonth();
}

export function aggregateTopItemsFromOrders(orders: OrderAnalyticsRow[]): TopItem[] {
  const grouped = new Map<string, TopItem>();

  for (const order of orders) {
    const orderAmount = asNumber(order.total_amount);
    const itemRows = Array.isArray(order.items) ? (order.items as Array<Record<string, unknown>>) : [];
    for (const item of itemRows) {
      const itemId = String(item.item_id ?? item.id ?? item.name ?? 'unknown');
      const itemName = String(item.name ?? item.item_name ?? itemId);
      const qty = asNumber(item.quantity);
      if (qty <= 0) continue;
      const current = grouped.get(itemId) ?? { item_id: itemId, item_name: itemName, count: 0, revenue: 0 };
      current.count += qty;
      // Approximate line revenue from unit_price/line_total when present, fallback proportional to order total.
      const lineTotal = asNumber(item.line_total);
      if (lineTotal > 0) {
        current.revenue += lineTotal;
      } else {
        const unitPrice = asNumber(item.unit_price);
        current.revenue += unitPrice > 0 ? unitPrice * qty : orderAmount;
      }
      grouped.set(itemId, current);
    }
  }

  return Array.from(grouped.values()).sort((a, b) => b.count - a.count);
}

export function aggregateDailyRevenue(
  orders: OrderAnalyticsRow[],
  timezoneOffsetMinutes: number
): Array<{ date: string; total_amount: number }> {
  const totals = new Map<string, number>();
  for (const order of orders) {
    const day = dayLabelFromIso(order.created_at, timezoneOffsetMinutes);
    totals.set(day, (totals.get(day) ?? 0) + asNumber(order.total_amount));
  }
  return Array.from(totals.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, total_amount]) => ({ date, total_amount: Number(total_amount.toFixed(2)) }));
}

export function aggregateMonthlyRevenue(
  orders: OrderAnalyticsRow[],
  timezoneOffsetMinutes: number
): Array<{ month: string; total_amount: number }> {
  const monthTotals = new Array<number>(12).fill(0);
  for (const order of orders) {
    const monthIndex = monthIndexFromIso(order.created_at, timezoneOffsetMinutes);
    monthTotals[monthIndex] += asNumber(order.total_amount);
  }
  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return monthTotals.map((total_amount, idx) => ({
    month: labels[idx],
    total_amount: Number(total_amount.toFixed(2)),
  }));
}

