'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';
import AppToast from '@/components/AppToast';
import { authFetch } from '@/lib/auth-fetch';
import { formatError } from '@/lib/errors';
import { useRouteGuard } from '@/lib/route-guard';

interface Sale {
  id: string;
  item_name: string;
  amount: number;
  staff_name: string;
  created_at: string;
  is_voided: boolean;
  void_reason: string | null;
}

interface RecentActivityGroup {
  key: string;
  item_name: string;
  staff_name: string;
  is_voided: boolean;
  latest_created_at: string;
  total_amount: number;
  unit_amount: number;
  count: number;
}

function normalizeItemKey(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function localDateKey(isoText: string) {
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function OwnerPage() {
  const { isChecking, isAuthorized, role } = useRouteGuard(['owner'], { unauthorizedRedirect: '/pos' });
  const inrFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
  const [sales, setSales] = useState<Sale[]>([]);
  const [voidedCount, setVoidedCount] = useState(0);
  const [insights, setInsights] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [inventoryItemKeys, setInventoryItemKeys] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'dashboard' | 'sales'>('dashboard');
  const [voidingSaleId, setVoidingSaleId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const tzOffset = encodeURIComponent(String(new Date().getTimezoneOffset()));
      const [salesRes, reportsRes] = await Promise.all([
        authFetch(`/api/sales?range=week&tz_offset=${tzOffset}`),
        authFetch('/api/reports?range=week'),
      ]);
      const salesPayload = await salesRes.json();
      const reportsPayload = await reportsRes.json();
      const salesRows = Array.isArray(salesPayload?.data) ? salesPayload.data : [];
      const salesVoidedCount = salesRows.filter((s: any) => Boolean(s?.is_voided)).length;
      setSales(salesRows);
      try {
        const voidsRes = await authFetch(`/api/voids?range=week&tz_offset=${tzOffset}`);
        const voidsPayload = await voidsRes.json();
        let voidLogsCount = Array.isArray(voidsPayload?.data) ? voidsPayload.data.length : 0;
        if (voidLogsCount === 0) {
          const allVoidsRes = await authFetch('/api/voids');
          const allVoidsPayload = await allVoidsRes.json();
          const allTimeVoidsCount = Array.isArray(allVoidsPayload?.data) ? allVoidsPayload.data.length : 0;
          voidLogsCount = Math.max(voidLogsCount, allTimeVoidsCount);
        }
        setVoidedCount(Math.max(voidLogsCount, salesVoidedCount));
      } catch {
        setVoidedCount(salesVoidedCount);
      }
      setInsights(reportsPayload?.insights || 'No insights available.');
      try {
        const inventoryRes = await authFetch('/api/inventory');
        const inventoryPayload = await inventoryRes.json();
        const inventoryRows = Array.isArray(inventoryPayload?.data) ? inventoryPayload.data : [];
        const itemKeys = new Set<string>();
        for (const row of inventoryRows) {
          const key = normalizeItemKey((row as any)?.item_name ?? (row as any)?.name);
          if (key) itemKeys.add(key);
        }
        setInventoryItemKeys(itemKeys);
      } catch {
        setInventoryItemKeys(new Set());
      }
    } catch (error) {
      console.error('Failed to fetch reports:', error);
      setToast({ type: 'error', message: `Failed to fetch reports: ${formatError(error)}` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthorized) return;
    void fetchReports();
  }, [fetchReports, isAuthorized]);

  const handleVoidSale = async (sale: Sale) => {
    if (sale.is_voided) return;
    const reason = window.prompt('Enter void reason (min 3 chars):', 'Cancelled by owner');
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setToast({ type: 'error', message: 'Void reason must be at least 3 characters.' });
      return;
    }
    const parsedSaleId = Number(sale.id);
    if (!Number.isInteger(parsedSaleId) || parsedSaleId <= 0) {
      setToast({ type: 'error', message: 'Invalid sale id for void operation.' });
      return;
    }

    setVoidingSaleId(sale.id);
    try {
      await authFetch('/api/voids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sale_id: parsedSaleId,
          staff_name: sale.staff_name,
          void_reason: reason.trim(),
          voided_amount: Number(sale.amount ?? 0),
        }),
      });
      setToast({ type: 'success', message: `Voided transaction ${sale.id}.` });
      await fetchReports();
    } catch (error) {
      setToast({ type: 'error', message: `Failed to void transaction: ${formatError(error)}` });
    } finally {
      setVoidingSaleId(null);
    }
  };

  if (isChecking) {
    return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Checking access...</div>;
  }

  if (!isAuthorized) return null;

  const totalSales = sales.filter((s) => !s.is_voided).reduce((sum, s) => sum + s.amount, 0);
  const totalVoided = voidedCount;
  const totalTransactions = sales.filter((s) => !s.is_voided).length;
  const recentActivityGroups = sales
    .filter((sale) => inventoryItemKeys.has(normalizeItemKey(sale.item_name)))
    .slice(0, 40)
    .reduce<RecentActivityGroup[]>((groups, sale) => {
      const amount = Number(sale.amount ?? 0);
      const normalizedAmount = Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0;
      const key = `${normalizeItemKey(sale.item_name)}|${String(sale.staff_name ?? '').trim().toLowerCase()}|${sale.is_voided ? 'voided' : 'ok'}|${localDateKey(sale.created_at)}|${normalizedAmount.toFixed(2)}`;
      const existing = groups.find((group) => group.key === key);
      if (!existing) {
        groups.push({
          key,
          item_name: sale.item_name,
          staff_name: sale.staff_name,
          is_voided: Boolean(sale.is_voided),
          latest_created_at: sale.created_at,
          total_amount: normalizedAmount,
          unit_amount: normalizedAmount,
          count: 1,
        });
        return groups;
      }
      existing.count += 1;
      existing.total_amount += normalizedAmount;
      if (new Date(sale.created_at).getTime() > new Date(existing.latest_created_at).getTime()) {
        existing.latest_created_at = sale.created_at;
      }
      return groups;
    }, [])
    .sort((a, b) => new Date(b.latest_created_at).getTime() - new Date(a.latest_created_at).getTime())
    .slice(0, 5);

  return (
    <div className="layout flex h-screen bg-slate-950 text-white">
      <Sidebar role={role} />
      {toast && <AppToast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      <div className="main-content flex flex-col">
        <PageHeader title="OWNER DASHBOARD" role={role} />

        <div className="bg-slate-900 border-b border-slate-800 flex gap-6 px-6">
          {(['dashboard', 'sales'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-4 font-semibold uppercase text-sm transition border-b-2 ${
                activeTab === tab
                  ? 'border-amber-400 text-amber-300'
                  : 'border-transparent text-slate-300 hover:text-white'
              }`}
            >
              {tab === 'dashboard' && 'Dashboard'}
              {tab === 'sales' && 'Sales'}
            </button>
          ))}
          <Link
            href="/owner/audit"
            className="ml-auto px-4 py-4 font-semibold uppercase text-sm transition border-b-2 border-transparent text-slate-300 hover:text-white"
          >
            Audit Log
          </Link>
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          {activeTab === 'dashboard' && (
            <div>
              <h2 className="text-2xl font-bold mb-6">Overview</h2>
              <div className="grid grid-cols-3 gap-6 mb-8">
                <StatCard label="Total Revenue" value={inrFormatter.format(totalSales)} />
                <StatCard label="Transactions" value={totalTransactions.toString()} />
                <StatCard label="Voided Transactions" value={totalVoided.toString()} />
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
                <h3 className="text-xl font-bold mb-4 text-amber-400">Recent Activity</h3>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {recentActivityGroups.length === 0 && (
                    <p className="text-slate-400">No recent activity for current inventory items.</p>
                  )}
                  {recentActivityGroups.map((activity) => (
                    <div
                      key={activity.key}
                      className={`flex justify-between items-center p-3 rounded-lg ${
                        activity.is_voided ? 'bg-red-900 bg-opacity-30' : 'bg-slate-800'
                      }`}
                    >
                      <div>
                        <p className="font-semibold">
                          {activity.item_name}
                          {activity.count > 1 ? ` x${activity.count}` : ''}
                        </p>
                        <p className="text-slate-300 text-sm">
                          {activity.staff_name} | {new Date(activity.latest_created_at).toLocaleString('en-IN')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold ${activity.is_voided ? 'text-rose-300 line-through' : 'text-emerald-300'}`}>
                          {inrFormatter.format(Number(activity.total_amount.toFixed(2)))}
                        </p>
                        <p className="text-xs text-slate-400">Avg: {inrFormatter.format(activity.unit_amount)}</p>
                        {activity.is_voided && <p className="text-rose-300 text-xs font-bold">VOIDED</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 mt-8">
                <h3 className="text-xl font-bold mb-4 text-amber-400">AI Auditor Insights</h3>
                {loading ? (
                  <p className="text-slate-400">Generating insights...</p>
                ) : (
                  <div className="text-slate-200 whitespace-pre-wrap">{insights}</div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'sales' && (
            <div>
              <h2 className="text-2xl font-bold mb-6">Sales History</h2>
              <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-800 border-b border-slate-700">
                    <tr>
                      <th className="px-6 py-3 text-left font-bold text-amber-400">Item</th>
                      <th className="px-6 py-3 text-left font-bold text-amber-400">Amount</th>
                      <th className="px-6 py-3 text-left font-bold text-amber-400">Staff</th>
                      <th className="px-6 py-3 text-left font-bold text-amber-400">Time</th>
                      <th className="px-6 py-3 text-left font-bold text-amber-400">Status</th>
                      <th className="px-6 py-3 text-left font-bold text-amber-400">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {sales.map((sale) => (
                      <tr key={sale.id} className="hover:bg-slate-800 transition">
                        <td className="px-6 py-3">{sale.item_name}</td>
                        <td className="px-6 py-3 text-emerald-300 font-bold">{inrFormatter.format(sale.amount)}</td>
                        <td className="px-6 py-3">{sale.staff_name}</td>
                        <td className="px-6 py-3 text-slate-300">{new Date(sale.created_at).toLocaleString()}</td>
                        <td className="px-6 py-3">
                          {sale.is_voided ? (
                            <span className="px-3 py-1 bg-rose-600 rounded-full text-sm font-bold">VOIDED</span>
                          ) : (
                            <span className="px-3 py-1 bg-emerald-600 rounded-full text-sm font-bold">OK</span>
                          )}
                        </td>
                        <td className="px-6 py-3">
                          <button
                            type="button"
                            onClick={() => void handleVoidSale(sale)}
                            disabled={sale.is_voided || voidingSaleId === sale.id}
                            className="px-3 py-1 bg-rose-700 hover:bg-rose-600 rounded text-xs font-bold disabled:bg-slate-600 disabled:cursor-not-allowed"
                          >
                            {sale.is_voided ? 'Voided' : voidingSaleId === sale.id ? 'Voiding...' : 'Void Order'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}


