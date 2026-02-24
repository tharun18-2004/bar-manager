'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';
import { authFetch } from '@/lib/auth-fetch';
import { useRouteGuard } from '@/lib/route-guard';
import {
  getPdfButtonLabel,
  getPdfFilename,
  getPdfPeriodLabel,
  isPdfExportDisabled,
} from '@/lib/report-pdf-controls';

interface SalesData {
  total_revenue: number;
  total_transactions: number;
  total_voided: number;
  avg_transaction: number;
  top_items: Array<{ name: string; count: number; revenue: number }>;
}

export default function ReportsPage() {
  const { isChecking, isAuthorized, role } = useRouteGuard(['manager', 'owner']);
  const [salesData, setSalesData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month'>('week');

  const handleDownloadPdf = async () => {
    if (!salesData || exporting) return;

    setErrorMessage(null);
    setExporting(true);

    try {
      const { generatePDF, downloadPDF } = await import('@/lib/pdf');
      const doc = generatePDF({
        totalRevenue: salesData.total_revenue,
        totalTransactions: salesData.total_transactions,
        topItems: salesData.top_items,
        dateRange: getPdfPeriodLabel(dateRange),
      });

      downloadPDF(doc, getPdfFilename(dateRange));
    } catch (error) {
      console.error('Failed to export PDF report:', error);
      setErrorMessage('Failed to generate PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const fetchReportData = useCallback(async () => {
    setErrorMessage(null);
    setLoading(true);

    try {
      const res = await authFetch(`/api/sales?range=${dateRange}`);
      const data = await res.json();

      if (data.data && data.data.length > 0) {
        const sales = data.data;
        const nonVoided = sales.filter((s: any) => !s.is_voided);

        const totalRevenue = nonVoided.reduce((sum: number, s: any) => sum + s.amount, 0);
        const itemCounts: { [key: string]: { count: number; revenue: number } } = {};

        nonVoided.forEach((s: any) => {
          if (!itemCounts[s.item_name]) {
            itemCounts[s.item_name] = { count: 0, revenue: 0 };
          }
          itemCounts[s.item_name].count += 1;
          itemCounts[s.item_name].revenue += s.amount;
        });

        const topItems = Object.entries(itemCounts)
          .map(([name, item]) => ({ name, ...item }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5);

        setSalesData({
          total_revenue: totalRevenue,
          total_transactions: nonVoided.length,
          total_voided: sales.filter((s: any) => s.is_voided).length,
          avg_transaction: nonVoided.length > 0 ? totalRevenue / nonVoided.length : 0,
          top_items: topItems,
        });
      } else {
        setSalesData(null);
      }
    } catch (error) {
      console.error('Failed to fetch reports:', error);
      setErrorMessage('Failed to load reports. Please refresh and try again.');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    if (!isAuthorized) return;
    fetchReportData();
  }, [fetchReportData, isAuthorized]);

  if (isChecking) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center">Checking access...</div>;
  }

  if (!isAuthorized) return null;

  return (
    <div className="flex h-screen bg-black text-white">
      <Sidebar role={role} />

      <div className="flex-1 flex flex-col">
        <PageHeader title="REPORTS & ANALYTICS" role={role} />

        <div className="flex-1 p-6 overflow-y-auto">
          <div className="flex gap-3 mb-8">
            {(['today', 'week', 'month'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-6 py-2 rounded-lg font-bold uppercase text-sm transition ${
                  dateRange === range ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                {range === 'today' && 'Today'}
                {range === 'week' && 'This Week'}
                {range === 'month' && 'This Month'}
              </button>
            ))}
            <button
              onClick={() => void handleDownloadPdf()}
              disabled={isPdfExportDisabled({
                loading,
                exporting,
                hasSalesData: Boolean(salesData),
              })}
              className="ml-auto px-6 py-2 rounded-lg font-bold uppercase text-sm transition bg-green-600 text-white hover:bg-green-500 disabled:bg-zinc-700 disabled:text-zinc-400 disabled:cursor-not-allowed"
            >
              {getPdfButtonLabel(exporting)}
            </button>
          </div>

          {errorMessage && (
            <div className="mb-6 rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
              {errorMessage}
            </div>
          )}

          {loading ? (
            <p className="text-zinc-500">Loading reports...</p>
          ) : salesData ? (
            <>
              <div className="grid grid-cols-4 gap-6 mb-8">
                <StatCard label="Total Revenue" value={`$${salesData.total_revenue.toFixed(2)}`} />
                <StatCard label="Transactions" value={salesData.total_transactions.toString()} />
                <StatCard label="Avg. Transaction" value={`$${salesData.avg_transaction.toFixed(2)}`} />
                <StatCard label="Voided" value={salesData.total_voided.toString()} type="danger" />
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
                <h2 className="text-2xl font-bold mb-6 text-blue-500">Top 5 Items by Revenue</h2>
                <div className="space-y-4">
                  {salesData.top_items.map((item, index) => (
                    <div key={item.name}>
                      <div className="flex justify-between mb-2">
                        <span className="font-semibold">
                          {index + 1}. {item.name}
                        </span>
                        <span className="text-green-400 font-bold">${item.revenue.toFixed(2)}</span>
                      </div>
                      <div className="w-full bg-zinc-800 rounded-full h-3 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-green-500 h-full"
                          style={{
                            width: `${(item.revenue / Math.max(...salesData.top_items.map((i) => i.revenue))) * 100}%`,
                          }}
                        />
                      </div>
                      <p className="text-zinc-500 text-sm mt-1">Sold: {item.count} units</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 mt-8">
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
                  <h3 className="text-xl font-bold mb-4 text-blue-500">Performance</h3>
                  <div className="space-y-3">
                    <p>
                      <span className="text-zinc-400">Efficiency: </span>
                      <span className="text-green-400 font-bold">
                        {(
                          (1 - salesData.total_voided / (salesData.total_transactions + salesData.total_voided)) *
                          100
                        ).toFixed(1)}
                        %
                      </span>
                    </p>
                    <p>
                      <span className="text-zinc-400">Items Sold: </span>
                      <span className="text-green-400 font-bold">
                        {salesData.top_items.reduce((sum, i) => sum + i.count, 0)}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
                  <h3 className="text-xl font-bold mb-4 text-blue-500">Status</h3>
                  <p className="text-green-400 text-lg font-bold">System Operational</p>
                  <p className="text-zinc-500 text-sm mt-2">All metrics up to date</p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-zinc-500">No data available</p>
          )}
        </div>
      </div>
    </div>
  );
}
