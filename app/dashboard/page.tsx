'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import { authFetch } from '@/lib/auth-fetch';
import { useRouteGuard } from '@/lib/route-guard';

type DashboardStats = {
  totalSalesToday: number;
  totalOrders: number;
  topSellingItem: string;
  lowStockItems: number;
  topItems: Array<{ name: string; count: number; revenue: number }>;
};

export default function DashboardPage() {
  const { isChecking, isAuthorized, role } = useRouteGuard(['staff', 'manager', 'owner']);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    totalSalesToday: 0,
    totalOrders: 0,
    topSellingItem: 'No sales yet',
    lowStockItems: 0,
    topItems: [],
  });

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const [salesRes, inventoryRes] = await Promise.all([
        authFetch('/api/sales?range=today'),
        authFetch('/api/inventory'),
      ]);

      const salesJson = await salesRes.json();
      const inventoryJson = await inventoryRes.json();
      const sales = Array.isArray(salesJson.data) ? salesJson.data.filter((s: any) => !s.is_voided) : [];
      const inventory = Array.isArray(inventoryJson.data) ? inventoryJson.data : [];

      const totalSalesToday = sales.reduce((sum: number, row: any) => sum + Number(row.amount), 0);
      const totalOrders = sales.length;

      const grouped = sales.reduce((acc: Record<string, { count: number; revenue: number }>, row: any) => {
        const itemName = String(row.item_name || 'Unknown');
        if (!acc[itemName]) acc[itemName] = { count: 0, revenue: 0 };
        acc[itemName].count += 1;
        acc[itemName].revenue += Number(row.amount);
        return acc;
      }, {});

      const topItems = Object.entries(grouped as Record<string, { count: number; revenue: number }>)
        .map(([name, value]) => ({ name, ...value }))
        .sort((a, b) => b.count - a.count);

      const lowStockItems = inventory.filter((item: any) => Number(item.quantity) <= 5).length;

      setStats({
        totalSalesToday,
        totalOrders,
        topSellingItem: topItems[0]?.name ?? 'No sales yet',
        lowStockItems,
        topItems: topItems.slice(0, 5),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthorized) return;
    void fetchStats();
  }, [fetchStats, isAuthorized]);

  const canExport = useMemo(() => !loading && !exporting && stats.totalOrders > 0, [exporting, loading, stats.totalOrders]);

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
    <div className="flex h-screen bg-slate-100 text-slate-900">
      <Sidebar role={role} />
      <div className="flex-1 flex flex-col min-w-0">
        <PageHeader title="Dashboard Analytics" role={role} />
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total Sales Today" value={`$${stats.totalSalesToday.toFixed(2)}`} />
            <StatCard label="Total Orders" value={stats.totalOrders} />
            <StatCard label="Top Selling Item" value={stats.topSellingItem} />
            <StatCard label="Low Stock Items" value={`${stats.lowStockItems} items`} type={stats.lowStockItems > 0 ? 'danger' : 'success'} />
          </div>

          <section className="mt-8 bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-slate-900">Top Items Today</h2>
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
              <p className="text-slate-500">No sales recorded today.</p>
            ) : (
              <div className="space-y-3">
                {stats.topItems.map((item, index) => (
                  <div key={item.name} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="font-semibold text-slate-800">
                      {index + 1}. {item.name}
                    </p>
                    <p className="text-sm font-semibold text-slate-600">
                      Sold {item.count} | ${item.revenue.toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
