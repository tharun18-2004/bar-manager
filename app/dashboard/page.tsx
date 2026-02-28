'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import { authFetch } from '@/lib/auth-fetch';
import { useRouteGuard } from '@/lib/route-guard';

type DashboardStats = {
  totalSalesToday: number;
  totalOrders: number;
  topSellingItem: string;
  lowStockItems: number | null;
  totalStockBottles: number;
  inventoryValue: number;
  todayGrossSales: number;
  todayExpense: number;
  todayProfit: number;
  topItems: Array<{ name: string; count: number; revenue: number }>;
};

function todayLocalIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function aggregateOrderRows(rows: any[]) {
  const totalSales = rows.reduce((sum: number, row: any) => sum + Number(row.total_amount ?? 0), 0);
  const totalOrders = rows.length;
  const aggregate = new Map<string, { count: number; revenue: number }>();

  for (const row of rows) {
    const orderItems = Array.isArray(row?.items) ? row.items : [];
    for (const item of orderItems) {
      const name = String((item as any)?.name ?? (item as any)?.item_name ?? 'Unknown');
      const qtyRaw = Number((item as any)?.quantity ?? 1);
      const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
      const lineTotalRaw = Number((item as any)?.line_total ?? Number((item as any)?.unit_price ?? 0) * qty);
      const lineTotal = Number.isFinite(lineTotalRaw) ? lineTotalRaw : 0;
      const current = aggregate.get(name) ?? { count: 0, revenue: 0 };
      current.count += qty;
      current.revenue += lineTotal;
      aggregate.set(name, current);
    }
  }

  const topItems = Array.from(aggregate.entries())
    .map(([name, value]) => ({
      name,
      count: Number(value.count ?? 0),
      revenue: Number((value.revenue ?? 0).toFixed(2)),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalSales: Number(totalSales.toFixed(2)),
    totalOrders,
    topSellingItem: topItems[0]?.name ?? 'No sales yet',
    topItems,
  };
}

export default function DashboardPage() {
  const { isChecking, isAuthorized, role } = useRouteGuard(['staff', 'owner']);
  const inrFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const fetchInFlightRef = useRef(false);
  const [stats, setStats] = useState<DashboardStats>({
      totalSalesToday: 0,
      totalOrders: 0,
      topSellingItem: 'No sales yet',
      lowStockItems: null,
      totalStockBottles: 0,
      inventoryValue: 0,
      todayGrossSales: 0,
      todayExpense: 0,
      todayProfit: 0,
      topItems: [],
  });

  const fetchStats = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    if (silent) setRefreshing(true);
    if (role !== 'owner') {
      if (!silent) setLoading(true);
      try {
        const query = new URLSearchParams({
          range: 'today',
          tz_offset: String(new Date().getTimezoneOffset()),
        });
        let totalSales = 0;
        let totalOrders = 0;
        const counts = new Map<string, number>();

        try {
          const res = await authFetch(`/api/orders?${query.toString()}`);
          const payload = await res.json();
          const rows = Array.isArray(payload.data) ? payload.data : [];
          if (rows.length > 0) {
            const aggregated = aggregateOrderRows(rows);
            totalSales = aggregated.totalSales;
            totalOrders = aggregated.totalOrders;
            for (const item of aggregated.topItems) {
              counts.set(item.name, item.count);
            }
          } else {
            const fallbackRes = await authFetch(`/api/sales?${query.toString()}`);
            const fallbackPayload = await fallbackRes.json();
            const salesRows = Array.isArray(fallbackPayload.data) ? fallbackPayload.data : [];
            const nonVoided = salesRows.filter((row: any) => !row.is_voided);
            totalSales = nonVoided.reduce((sum: number, row: any) => sum + Number(row.amount ?? row.line_total ?? 0), 0);
            totalOrders = nonVoided.length;
            for (const row of nonVoided) {
              const name = String(row.item_name ?? row.name ?? 'Unknown');
              counts.set(name, (counts.get(name) ?? 0) + 1);
            }
          }
        } catch {
          const fallbackRes = await authFetch(`/api/sales?${query.toString()}`);
          const fallbackPayload = await fallbackRes.json();
          const salesRows = Array.isArray(fallbackPayload.data) ? fallbackPayload.data : [];
          const nonVoided = salesRows.filter((row: any) => !row.is_voided);
          totalSales = nonVoided.reduce((sum: number, row: any) => sum + Number(row.amount ?? row.line_total ?? 0), 0);
          totalOrders = nonVoided.length;
          for (const row of nonVoided) {
            const name = String(row.item_name ?? row.name ?? 'Unknown');
            counts.set(name, (counts.get(name) ?? 0) + 1);
          }
        }
        let topItem = 'No sales yet';
        counts.forEach((count, name) => {
          const currentBest = counts.get(topItem) ?? -1;
          if (count > currentBest) topItem = name;
        });

        setStats({
          totalSalesToday: Number(totalSales.toFixed(2)),
          totalOrders,
          topSellingItem: topItem,
          lowStockItems: null,
          totalStockBottles: 0,
          inventoryValue: 0,
          todayGrossSales: Number(totalSales.toFixed(2)),
          todayExpense: 0,
          todayProfit: Number(totalSales.toFixed(2)),
          topItems: [],
        });
        setLastUpdatedAt(new Date());
      } catch (error) {
        console.error('Failed to load staff dashboard stats', error);
      } finally {
        fetchInFlightRef.current = false;
        if (!silent) setLoading(false);
        if (silent) setRefreshing(false);
      }
      return;
    }

    if (!silent) setLoading(true);
    try {
      const monthQuery = new URLSearchParams({
        range: 'month',
        tz_offset: String(new Date().getTimezoneOffset()),
      });
      const monthRes = await authFetch(`/api/dashboard-analytics?${monthQuery.toString()}`);
      const monthPayload = await monthRes.json();
      const monthData = monthPayload?.data ?? {};
      const aggregated = {
        totalSales: Number(monthData?.totalSales ?? 0),
        totalOrders: Number(monthData?.totalOrders ?? 0),
        topSellingItem: (() => {
          const first = Array.isArray(monthData?.topItems) ? monthData.topItems[0] : null;
          return first?.item_name ?? 'No sales yet';
        })(),
        topItems: (Array.isArray(monthData?.topItems) ? monthData.topItems : []).map((item: any) => ({
          name: String(item?.item_name ?? item?.name ?? 'Unknown'),
          count: Number(item?.count ?? 0),
          revenue: Number(item?.revenue ?? 0),
        })),
      };

      const inventoryRes = await authFetch('/api/inventory');
      const inventoryPayload = await inventoryRes.json();
      const inventoryRows = Array.isArray(inventoryPayload.data) ? inventoryPayload.data : [];
      const totalStockBottles = inventoryRows.reduce((sum: number, row: any) => sum + Number(row?.stock_quantity ?? row?.quantity ?? 0), 0);
      const inventoryValue = inventoryRows.reduce(
        (sum: number, row: any) =>
          sum + Number(row?.stock_quantity ?? row?.quantity ?? 0) * Number(row?.selling_price ?? row?.unit_price ?? 0),
        0
      );
      const lowStockItems = inventoryRows.filter((row: any) => {
        const stock = Number(row?.stock_quantity ?? row?.quantity ?? 0);
        const thresholdRaw = Number(row?.low_stock_alert ?? 5);
        const threshold = Number.isFinite(thresholdRaw) && thresholdRaw >= 0 ? Math.trunc(thresholdRaw) : 5;
        return stock < threshold;
      }).length;

      const todayQuery = new URLSearchParams({
        range: 'today',
        tz_offset: String(new Date().getTimezoneOffset()),
      });
      const todaySummaryRes = await authFetch(`/api/dashboard-analytics?${todayQuery.toString()}`);
      const todaySummaryPayload = await todaySummaryRes.json();
      const todaySummaryData = todaySummaryPayload?.data ?? {};
      const todayGrossSales = Number(todaySummaryData?.totalSales ?? 0);

      const todayDate = todayLocalIsoDate();
      let todayExpense = 0;
      try {
        const expensesRes = await authFetch(`/api/expenses?date=${encodeURIComponent(todayDate)}`);
        const expensesPayload = await expensesRes.json();
        todayExpense = Number(expensesPayload?.summary?.total_amount ?? 0);
      } catch (error) {
        console.error('Failed to fetch expenses for dashboard P&L:', error);
      }
      const todayProfit = todayGrossSales - todayExpense;

      setStats({
        totalSalesToday: aggregated.totalSales,
        totalOrders: aggregated.totalOrders,
        topSellingItem: aggregated.topSellingItem,
        lowStockItems,
        totalStockBottles,
        inventoryValue: Number(inventoryValue.toFixed(2)),
        todayGrossSales: Number(todayGrossSales.toFixed(2)),
        todayExpense: Number(todayExpense.toFixed(2)),
        todayProfit: Number(todayProfit.toFixed(2)),
        topItems: aggregated.topItems,
      });
      setLastUpdatedAt(new Date());
    } catch (error) {
      console.error('Failed to load owner dashboard stats', error);
    } finally {
      fetchInFlightRef.current = false;
      if (!silent) setLoading(false);
      if (silent) setRefreshing(false);
    }
  }, [role]);

  useEffect(() => {
    if (!isAuthorized) return;
    void fetchStats({ silent: false });
  }, [fetchStats, isAuthorized]);

  useEffect(() => {
    if (!isAuthorized) return;

    const interval = window.setInterval(() => {
      void fetchStats({ silent: true });
    }, 45000);

    const onFocus = () => {
      if (document.visibilityState === 'hidden') return;
      void fetchStats({ silent: true });
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [fetchStats, isAuthorized]);

  const canExport = useMemo(
    () => role === 'owner' && !loading && !exporting && stats.totalOrders > 0,
    [exporting, loading, role, stats.totalOrders]
  );
  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdatedAt) return 'Never';
    return lastUpdatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, [lastUpdatedAt]);

  const handleDownloadPdf = async () => {
    if (!canExport) return;
    setExporting(true);
    try {
      const { generatePDF, downloadPDF } = await import('@/lib/pdf');
      const doc = generatePDF({
        totalRevenue: stats.totalSalesToday,
        totalTransactions: stats.totalOrders,
        topItems: stats.topItems,
        dateRange: 'Today',
      });
      downloadPDF(doc, `dashboard-summary-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  if (isChecking) {
    return <div className="min-h-screen bg-slate-100 text-slate-700 flex items-center justify-center">Checking access...</div>;
  }

  if (!isAuthorized) return null;

  return (
    <div className="layout flex h-screen bg-slate-100 text-slate-900">
      <Sidebar role={role} />
      <div className="main-content flex flex-col min-w-0">
        <PageHeader title={role === 'owner' ? 'Dashboard Analytics' : 'Staff Dashboard'} role={role} />
        <main className="flex-1 p-8 overflow-y-auto">
          {role !== 'owner' ? (
            <>
              <div className="grid gap-5 md:grid-cols-3">
                <StatCard label="Today Sales" value={inrFormatter.format(stats.totalSalesToday)} />
                <StatCard label="Today Orders" value={stats.totalOrders} />
                <StatCard label="Top Item (Today)" value={stats.topSellingItem} />
              </div>
              <section className="mt-8 bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                <h2 className="text-xl font-bold text-slate-900 mb-3">Operational Access</h2>
                <p className="text-slate-600">
                  Staff accounts can use POS and Tables. Revenue analytics, inventory, reports, and audit logs are owner-only.
                </p>
              </section>
            </>
          ) : (
            <>
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Total Stock" value={stats.totalStockBottles} />
                <StatCard label="Inventory Value" value={inrFormatter.format(stats.inventoryValue)} />
                <StatCard label="Low Stock Items" value={stats.lowStockItems ?? 0} type={(stats.lowStockItems ?? 0) > 0 ? 'danger' : 'success'} />
                <StatCard label="Today Profit" value={inrFormatter.format(stats.todayProfit)} type={stats.todayProfit < 0 ? 'danger' : 'success'} />
              </div>

              <section className="mt-8 bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-slate-900">Today P&L</h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void fetchStats({ silent: false })}
                      disabled={loading || refreshing}
                      className="px-2.5 py-1 rounded-full bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {refreshing ? 'Refreshing...' : 'Refresh Now'}
                    </button>
                    <span className="px-2.5 py-1 rounded-full bg-blue-50 border border-blue-100 text-xs font-bold text-blue-700">
                      Range: Today
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-600">
                      Last updated: {lastUpdatedLabel}
                    </span>
                  </div>
                </div>
                <div className="grid gap-5 md:grid-cols-3">
                  <StatCard label="Total Sales" value={inrFormatter.format(stats.todayGrossSales)} />
                  <StatCard label="Total Expense" value={inrFormatter.format(stats.todayExpense)} type={stats.todayExpense > 0 ? 'danger' : 'default'} />
                  <StatCard label="Net Profit" value={inrFormatter.format(stats.todayProfit)} type={stats.todayProfit < 0 ? 'danger' : 'success'} />
                </div>
              </section>

              <section className="mt-8 bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-slate-900">Top Items (Month)</h2>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-xs font-bold text-emerald-700">
                      Range: This Month
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDownloadPdf()}
                    disabled={!canExport}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500 disabled:bg-slate-300 disabled:text-slate-600 transition"
                  >
                    {exporting ? 'Generating...' : 'Download Invoice PDF'}
                  </button>
                </div>
                {loading ? (
                  <p className="text-slate-500">Loading analytics...</p>
                ) : stats.topItems.length === 0 ? (
                  <p className="text-slate-500">No sales recorded for this month.</p>
                ) : (
                  <div className="space-y-3">
                    {stats.topItems.map((item, index) => (
                      <div key={item.name} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="font-semibold text-slate-800">
                          {index + 1}. {item.name}
                        </p>
                        <p className="text-sm font-semibold text-slate-600">
                          Sold {item.count} | {inrFormatter.format(item.revenue)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}



