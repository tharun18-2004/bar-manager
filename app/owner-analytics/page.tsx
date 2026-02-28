'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Sidebar from '@/components/Sidebar';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import { authFetch } from '@/lib/auth-fetch';
import { useRouteGuard } from '@/lib/route-guard';

type MonthlyOverview = {
  total_sales: number;
  total_orders: number;
  average_order_value: number;
};

type PaymentBreakdownRow = {
  payment_method: string;
  total_amount: number;
};

type DailyRevenueRow = {
  date: string;
  total_amount: number;
};

type MonthlySalesRow = {
  month: string;
  total_amount: number;
};

type TopSellingItem = {
  item_id: string;
  total_quantity: number;
  item_name: string | null;
} | null;

type OwnerAnalyticsPayload = {
  monthlyOverview: MonthlyOverview;
  paymentBreakdown: PaymentBreakdownRow[];
  dailyRevenue: DailyRevenueRow[];
  monthlySales: MonthlySalesRow[];
  topSellingItem: TopSellingItem;
  selectedMonth?: string | null;
  stockRegisterSummary?: {
    total_bottles_sold: number;
    total_revenue: number;
    current_remaining_stock: number;
  };
};

const PAYMENT_COLORS = ['#2563eb', '#0891b2', '#16a34a', '#ea580c', '#a21caf'];

export default function OwnerAnalyticsPage() {
  const { isChecking, isAuthorized, role } = useRouteGuard(['owner'], { unauthorizedRedirect: '/pos' });
  const inrFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
  const [loading, setLoading] = useState(true);
  const [closingMonth, setClosingMonth] = useState(false);
  const [closeMessage, setCloseMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<OwnerAnalyticsPayload | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const fetchInFlightRef = useRef(false);

  const fetchAnalytics = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    if (!silent) setLoading(true);
    if (silent) setRefreshing(true);
    setErrorMessage(null);
    try {
      const query = new URLSearchParams({
        tz_offset: String(new Date().getTimezoneOffset()),
        show_archived: 'true',
        month: selectedMonth,
      });
      const response = await authFetch(`/api/owner-analytics?${query.toString()}`);
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Failed to load analytics');
      }
      setAnalytics(payload.data as OwnerAnalyticsPayload);
      setLastUpdatedAt(new Date());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load analytics';
      setErrorMessage(message);
    } finally {
      fetchInFlightRef.current = false;
      if (!silent) setLoading(false);
      if (silent) setRefreshing(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    if (!isAuthorized) return;
    void fetchAnalytics({ silent: false });
  }, [fetchAnalytics, isAuthorized]);

  useEffect(() => {
    if (!isAuthorized) return;

    const interval = window.setInterval(() => {
      void fetchAnalytics({ silent: true });
    }, 45000);

    const onFocus = () => {
      if (document.visibilityState === 'hidden') return;
      void fetchAnalytics({ silent: true });
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [fetchAnalytics, isAuthorized]);

  const handleMonthEndClose = useCallback(async () => {
    const confirmed = window.confirm(
      'Run month-end close now? This will cancel all currently open tabs and create a month snapshot.'
    );
    if (!confirmed) return;

    setClosingMonth(true);
    setCloseMessage(null);
    setErrorMessage(null);
    try {
      const response = await authFetch('/api/month-close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tz_offset: new Date().getTimezoneOffset(),
        }),
      });
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Month-end close failed');
      }
      setCloseMessage(typeof payload.message === 'string' ? payload.message : 'Month closed successfully.');
      await fetchAnalytics({ silent: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Month-end close failed';
      setErrorMessage(message);
    } finally {
      setClosingMonth(false);
    }
  }, [fetchAnalytics]);

  const formattedDailyRevenue = useMemo(
    () =>
      (analytics?.dailyRevenue ?? []).map((row) => ({
        ...row,
        day: new Date(row.date).getDate().toString(),
      })),
    [analytics?.dailyRevenue]
  );
  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdatedAt) return 'Never';
    return lastUpdatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, [lastUpdatedAt]);

  if (isChecking) {
    return <div className="min-h-screen bg-slate-100 text-slate-700 flex items-center justify-center">Checking access...</div>;
  }

  if (!isAuthorized) return null;

  return (
    <div className="layout flex h-screen bg-slate-100 text-slate-900">
      <Sidebar role={role} />

      <div className="main-content flex flex-col min-w-0">
        <PageHeader title="Owner Analytics" role={role} />

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => void handleMonthEndClose()}
              disabled={closingMonth || loading}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-700 disabled:bg-slate-300 disabled:text-slate-600 transition"
            >
              {closingMonth ? 'Closing Month...' : 'Month-End Close'}
            </button>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void fetchAnalytics({ silent: false })}
              disabled={loading || refreshing}
              className="px-2.5 py-1 rounded-full bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {refreshing ? 'Refreshing...' : 'Refresh Now'}
            </button>
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-xs font-bold text-emerald-700">
              Range: {selectedMonth}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-600">
              Last updated: {lastUpdatedLabel}
            </span>
            <label htmlFor="analytics-month" className="text-sm font-semibold text-slate-600">Month</label>
            <input
              id="analytics-month"
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
            />
          </div>

          {closeMessage && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {closeMessage}
            </div>
          )}

          {errorMessage && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              label="Monthly Sales"
              value={loading ? '...' : inrFormatter.format(analytics?.monthlyOverview.total_sales ?? 0)}
            />
            <StatCard
              label="Monthly Orders"
              value={loading ? '...' : String(analytics?.monthlyOverview.total_orders ?? 0)}
            />
            <StatCard
              label="Avg Order Value"
              value={loading ? '...' : inrFormatter.format(analytics?.monthlyOverview.average_order_value ?? 0)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              label="Stock Bottles Sold"
              value={loading ? '...' : String(analytics?.stockRegisterSummary?.total_bottles_sold ?? 0)}
            />
            <StatCard
              label="Stock Revenue"
              value={loading ? '...' : inrFormatter.format(analytics?.stockRegisterSummary?.total_revenue ?? 0)}
            />
            <StatCard
              label="Remaining Stock"
              value={loading ? '...' : String(analytics?.stockRegisterSummary?.current_remaining_stock ?? 0)}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold mb-4">Payment Method Breakdown (Current Month)</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analytics?.paymentBreakdown ?? []}
                      dataKey="total_amount"
                      nameKey="payment_method"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                    >
                      {(analytics?.paymentBreakdown ?? []).map((row, index) => (
                        <Cell key={row.payment_method} fill={PAYMENT_COLORS[index % PAYMENT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => inrFormatter.format(Number(value))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                {(analytics?.paymentBreakdown ?? []).map((row, index) => (
                  <div key={row.payment_method} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: PAYMENT_COLORS[index % PAYMENT_COLORS.length] }}
                      />
                      {row.payment_method}
                    </span>
                    <span className="font-semibold">{inrFormatter.format(row.total_amount)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold mb-4">Top Selling Item (Current Month)</h2>
              <div className="h-72 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-100">
                {loading ? (
                  <p className="text-slate-500">Loading...</p>
                ) : analytics?.topSellingItem ? (
                  <div className="text-center">
                    <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Top Item</p>
                    <p className="text-3xl font-black text-slate-900 mt-1">
                      {analytics.topSellingItem.item_name || analytics.topSellingItem.item_id}
                    </p>
                    <p className="text-xs text-slate-500 mt-2">ID: {analytics.topSellingItem.item_id}</p>
                    <p className="text-sm text-slate-500 mt-2">Total Quantity Sold</p>
                    <p className="text-2xl font-bold text-blue-700">{analytics.topSellingItem.total_quantity}</p>
                  </div>
                ) : (
                  <p className="text-slate-500">No item sales data available for this month.</p>
                )}
              </div>
            </section>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold mb-4">Daily Revenue (Current Month)</h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={formattedDailyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" tick={{ fill: '#475569', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#475569', fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => inrFormatter.format(Number(value))} />
                  <Line type="monotone" dataKey="total_amount" stroke="#2563eb" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold mb-4">Monthly Sales (Current Year)</h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics?.monthlySales ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fill: '#475569', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#475569', fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => inrFormatter.format(Number(value))} />
                  <Bar dataKey="total_amount" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}


