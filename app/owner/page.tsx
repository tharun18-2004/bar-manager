'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';
import { authFetch } from '@/lib/auth-fetch';
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

export default function OwnerPage() {
  const { isChecking, isAuthorized, role } = useRouteGuard(['owner'], { unauthorizedRedirect: '/pos' });
  const [sales, setSales] = useState<Sale[]>([]);
  const [insights, setInsights] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'sales'>('dashboard');

  useEffect(() => {
    if (!isAuthorized) return;

    const fetchReports = async () => {
      try {
        const res = await authFetch('/api/reports?range=week');
        const { data, insights } = await res.json();
        setSales(data || []);
        setInsights(insights || 'No insights available.');
      } catch (error) {
        console.error('Failed to fetch reports:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [isAuthorized]);

  if (isChecking) {
    return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Checking access...</div>;
  }

  if (!isAuthorized) return null;

  const totalSales = sales.filter((s) => !s.is_voided).reduce((sum, s) => sum + s.amount, 0);
  const totalVoided = sales.filter((s) => s.is_voided).length;
  const totalTransactions = sales.filter((s) => !s.is_voided).length;

  return (
    <div className="flex h-screen bg-slate-950 text-white">
      <Sidebar role={role} />

      <div className="flex-1 flex flex-col">
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
                <StatCard label="Total Revenue" value={`$${totalSales.toFixed(2)}`} />
                <StatCard label="Transactions" value={totalTransactions.toString()} />
                <StatCard label="Voided Transactions" value={totalVoided.toString()} />
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
                <h3 className="text-xl font-bold mb-4 text-amber-400">Recent Activity</h3>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {sales.slice(-5).reverse().map((sale) => (
                    <div
                      key={sale.id}
                      className={`flex justify-between items-center p-3 rounded-lg ${
                        sale.is_voided ? 'bg-red-900 bg-opacity-30' : 'bg-slate-800'
                      }`}
                    >
                      <div>
                        <p className="font-semibold">{sale.item_name}</p>
                        <p className="text-slate-300 text-sm">
                          {sale.staff_name} | {new Date(sale.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold ${sale.is_voided ? 'text-rose-300 line-through' : 'text-emerald-300'}`}>
                          ${sale.amount.toFixed(2)}
                        </p>
                        {sale.is_voided && <p className="text-rose-300 text-xs font-bold">VOIDED</p>}
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {sales.map((sale) => (
                      <tr key={sale.id} className="hover:bg-slate-800 transition">
                        <td className="px-6 py-3">{sale.item_name}</td>
                        <td className="px-6 py-3 text-emerald-300 font-bold">${sale.amount.toFixed(2)}</td>
                        <td className="px-6 py-3">{sale.staff_name}</td>
                        <td className="px-6 py-3 text-slate-300">{new Date(sale.created_at).toLocaleString()}</td>
                        <td className="px-6 py-3">
                          {sale.is_voided ? (
                            <span className="px-3 py-1 bg-rose-600 rounded-full text-sm font-bold">VOIDED</span>
                          ) : (
                            <span className="px-3 py-1 bg-emerald-600 rounded-full text-sm font-bold">OK</span>
                          )}
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
