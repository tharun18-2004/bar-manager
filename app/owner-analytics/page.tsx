'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
} | null;

type OwnerAnalyticsPayload = {
  monthlyOverview: MonthlyOverview;
  paymentBreakdown: PaymentBreakdownRow[];
  dailyRevenue: DailyRevenueRow[];
  monthlySales: MonthlySalesRow[];
  topSellingItem: TopSellingItem;
};

const PAYMENT_COLORS = ['#2563eb', '#0891b2', '#16a34a', '#ea580c', '#a21caf'];

export default function OwnerAnalyticsPage() {
  const { isChecking, isAuthorized, role } = useRouteGuard(['owner'], { unauthorizedRedirect: '/dashboard' });
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<OwnerAnalyticsPayload | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await authFetch('/api/owner-analytics');
      const payload = await response.json();
      if (!payload.success) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Failed to load analytics');
      }
      setAnalytics(payload.data as OwnerAnalyticsPayload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load analytics';
      setErrorMessage(message);
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthorized) return;
    void fetchAnalytics();
  }, [fetchAnalytics, isAuthorized]);

  const formattedDailyRevenue = useMemo(
    () =>
      (analytics?.dailyRevenue ?? []).map((row) => ({
        ...row,
        day: new Date(row.date).getDate().toString(),
      })),
    [analytics?.dailyRevenue]
  );

  if (isChecking) {
    return <div className="min-h-screen bg-slate-100 text-slate-700 flex items-center justify-center">Checking access...</div>;
  }

  if (!isAuthorized) return null;

  return (
    <div className="flex h-screen bg-slate-100 text-slate-900">
      <Sidebar role={role} />

      <div className="flex-1 flex flex-col min-w-0">
        <PageHeader title="Owner Analytics" role={role} />

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMessage && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              label="Monthly Sales"
              value={loading ? '...' : `$${(analytics?.monthlyOverview.total_sales ?? 0).toFixed(2)}`}
            />
            <StatCard
              label="Monthly Orders"
              value={loading ? '...' : String(analytics?.monthlyOverview.total_orders ?? 0)}
            />
            <StatCard
              label="Avg Order Value"
              value={loading ? '...' : `$${(analytics?.monthlyOverview.average_order_value ?? 0).toFixed(2)}`}
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
                    <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
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
                    <span className="font-semibold">${row.total_amount.toFixed(2)}</span>
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
                    <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Item ID</p>
                    <p className="text-3xl font-black text-slate-900 mt-1">{analytics.topSellingItem.item_id}</p>
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
                  <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
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
                  <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
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
