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
  const { isChecking, isAuthorized, role } = useRouteGuard(['owner']);
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
    return <div className="min-h-screen bg-black text-white flex items-center justify-center">Checking access...</div>;
  }

  if (!isAuthorized) return null;

  const totalSales = sales.filter((s) => !s.is_voided).reduce((sum, s) => sum + s.amount, 0);
  const totalVoided = sales.filter((s) => s.is_voided).length;
  const totalTransactions = sales.filter((s) => !s.is_voided).length;

  return (
    <div className="flex h-screen bg-black text-white">
      <Sidebar role={role} />

      <div className="flex-1 flex flex-col">
        <PageHeader title="OWNER DASHBOARD" role={role} />

        <div className="bg-zinc-900 border-b border-zinc-800 flex gap-6 px-6">
          {(['dashboard', 'sales'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-4 font-semibold uppercase text-sm transition border-b-2 ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-zinc-400 hover:text-white'
              }`}
            >
              {tab === 'dashboard' && 'Dashboard'}
              {tab === 'sales' && 'Sales'}
            </button>
          ))}
          <Link
            href="/owner/audit"
            className="ml-auto px-4 py-4 font-semibold uppercase text-sm transition border-b-2 border-transparent text-zinc-400 hover:text-white"
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

              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
                <h3 className="text-xl font-bold mb-4 text-blue-500">Recent Activity</h3>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {sales.slice(-5).reverse().map((sale) => (
                    <div
                      key={sale.id}
                      className={`flex justify-between items-center p-3 rounded-lg ${
                        sale.is_voided ? 'bg-red-900 bg-opacity-30' : 'bg-zinc-800'
                      }`}
                    >
                      <div>
                        <p className="font-semibold">{sale.item_name}</p>
                        <p className="text-zinc-400 text-sm">
                          {sale.staff_name} | {new Date(sale.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold ${sale.is_voided ? 'text-red-400 line-through' : 'text-green-400'}`}>
                          ${sale.amount.toFixed(2)}
                        </p>
                        {sale.is_voided && <p className="text-red-400 text-xs font-bold">VOIDED</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mt-8">
                <h3 className="text-xl font-bold mb-4 text-blue-500">AI Auditor Insights</h3>
                {loading ? (
                  <p className="text-zinc-500">Generating insights...</p>
                ) : (
                  <div className="text-zinc-300 whitespace-pre-wrap">{insights}</div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'sales' && (
            <div>
              <h2 className="text-2xl font-bold mb-6">Sales History</h2>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-zinc-800 border-b border-zinc-700">
                    <tr>
                      <th className="px-6 py-3 text-left font-bold text-blue-500">Item</th>
                      <th className="px-6 py-3 text-left font-bold text-blue-500">Amount</th>
                      <th className="px-6 py-3 text-left font-bold text-blue-500">Staff</th>
                      <th className="px-6 py-3 text-left font-bold text-blue-500">Time</th>
                      <th className="px-6 py-3 text-left font-bold text-blue-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {sales.map((sale) => (
                      <tr key={sale.id} className="hover:bg-zinc-800 transition">
                        <td className="px-6 py-3">{sale.item_name}</td>
                        <td className="px-6 py-3 text-green-400 font-bold">${sale.amount.toFixed(2)}</td>
                        <td className="px-6 py-3">{sale.staff_name}</td>
                        <td className="px-6 py-3 text-zinc-400">{new Date(sale.created_at).toLocaleString()}</td>
                        <td className="px-6 py-3">
                          {sale.is_voided ? (
                            <span className="px-3 py-1 bg-red-600 rounded-full text-sm font-bold">VOIDED</span>
                          ) : (
                            <span className="px-3 py-1 bg-green-600 rounded-full text-sm font-bold">OK</span>
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
