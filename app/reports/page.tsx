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
  const { isChecking, isAuthorized, role } = useRouteGuard(['owner'], { unauthorizedRedirect: '/pos' });
  const inrFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
  const [salesData, setSalesData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month'>('month');

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
      const tzOffset = encodeURIComponent(String(new Date().getTimezoneOffset()));
      const reportsRes = await authFetch(`/api/reports?range=${dateRange}&tz_offset=${tzOffset}`);
      const payload = await reportsRes.json();
      if (payload?.success && payload?.data) {
        const summary = payload.data as SalesData;
        if ((summary.total_transactions ?? 0) > 0) {
          setSalesData(summary);
        } else {
          setSalesData(null);
        }
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
    return <div className="min-h-screen bg-slate-100 text-slate-700 flex items-center justify-center">Checking access...</div>;
  }

  if (!isAuthorized) return null;

  return (
    <div className="layout flex h-screen bg-slate-100 text-slate-900">
      <Sidebar role={role} />

      <div className="main-content flex flex-col min-w-0">
        <PageHeader title="Reports & Analytics" role={role} />

        <div className="flex-1 p-6 overflow-y-auto">
          <div className="flex gap-3 mb-8">
            {(['today', 'week', 'month'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-6 py-2 rounded-lg font-bold uppercase text-sm transition ${
                  dateRange === range ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
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
              className="ml-auto px-6 py-2 rounded-lg font-bold uppercase text-sm transition bg-blue-600 text-white hover:bg-blue-500 disabled:bg-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed"
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
            <p className="text-slate-500">Loading reports...</p>
          ) : salesData ? (
            <>
              <div className="grid grid-cols-4 gap-6 mb-8">
                <StatCard label="Total Revenue" value={inrFormatter.format(salesData.total_revenue)} />
                <StatCard label="Transactions" value={salesData.total_transactions.toString()} />
                <StatCard label="Avg. Transaction" value={inrFormatter.format(salesData.avg_transaction)} />
                <StatCard label="Voided" value={salesData.total_voided.toString()} type="danger" />
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <h2 className="text-2xl font-bold mb-6 text-slate-900">Top 5 Items by Quantity</h2>
                <div className="space-y-4">
                  {salesData.top_items.map((item, index) => (
                    <div key={item.name}>
                      <div className="flex justify-between mb-2">
                        <span className="font-semibold text-slate-700">
                          {index + 1}. {item.name}
                        </span>
                        <span className="text-blue-700 font-bold">{inrFormatter.format(item.revenue)}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-green-500 h-full"
                          style={{
                            width: `${(item.count / Math.max(...salesData.top_items.map((i) => i.count))) * 100}%`,
                          }}
                        />
                      </div>
                      <p className="text-slate-500 text-sm mt-1">Sold: {item.count} units</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 mt-8">
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <h3 className="text-xl font-bold mb-4 text-slate-900">Performance</h3>
                  <div className="space-y-3">
                    <p>
                      <span className="text-slate-500">Efficiency: </span>
                      <span className="text-emerald-600 font-bold">
                        {(
                          (1 - salesData.total_voided / (salesData.total_transactions + salesData.total_voided)) *
                          100
                        ).toFixed(1)}
                        %
                      </span>
                    </p>
                    <p>
                      <span className="text-slate-500">Items Sold: </span>
                      <span className="text-emerald-600 font-bold">
                        {salesData.top_items.reduce((sum, i) => sum + i.count, 0)}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <h3 className="text-xl font-bold mb-4 text-slate-900">Status</h3>
                  <p className="text-emerald-600 text-lg font-bold">System Operational</p>
                  <p className="text-slate-500 text-sm mt-2">All metrics up to date</p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-slate-500">No data available</p>
          )}
        </div>
      </div>
    </div>
  );
}


