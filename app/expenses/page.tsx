'use client';

import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import AppToast from '@/components/AppToast';
import { authFetch } from '@/lib/auth-fetch';
import { formatError } from '@/lib/errors';
import { useRouteGuard } from '@/lib/route-guard';

type ExpenseRow = {
  id: number;
  date: string;
  type: string;
  amount: number;
  created_at: string;
};

function todayLocalIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function ExpensesPage() {
  const { isChecking, isAuthorized, role } = useRouteGuard(['owner'], { unauthorizedRedirect: '/pos' });
  const inrFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [form, setForm] = useState({
    date: todayLocalIsoDate(),
    type: '',
  });
  const [amountInput, setAmountInput] = useState('0');

  const totalExpense = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    [rows]
  );

  async function fetchExpenses() {
    setLoading(true);
    try {
      const res = await authFetch('/api/expenses');
      const payload = await res.json();
      setRows(Array.isArray(payload?.data) ? payload.data : []);
    } catch (error) {
      setToast({ type: 'error', message: `Failed to fetch expenses: ${formatError(error)}` });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAuthorized) return;
    void fetchExpenses();
  }, [isAuthorized]);

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const normalizedAmount = Number(amountInput);
      if (!Number.isFinite(normalizedAmount) || normalizedAmount < 0) {
        throw new Error('amount must be a non-negative number');
      }

      const res = await authFetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: normalizedAmount }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Failed to add expense');
      setToast({ type: 'success', message: 'Expense added.' });
      setForm({ date: todayLocalIsoDate(), type: '' });
      setAmountInput('0');
      await fetchExpenses();
    } catch (error) {
      setToast({ type: 'error', message: `Failed to add expense: ${formatError(error)}` });
    } finally {
      setSaving(false);
    }
  }

  if (isChecking) {
    return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Checking access...</div>;
  }

  if (!isAuthorized) return null;

  return (
    <div className="layout flex h-screen bg-slate-950 text-white">
      <Sidebar role={role} />
      {toast && <AppToast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
      <div className="main-content flex flex-col">
        <PageHeader title="EXPENSES" role={role} />
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="grid grid-cols-2 gap-6 mb-8">
            <StatCard label="Total Expenses" value={inrFormatter.format(totalExpense)} />
            <StatCard label="Entries" value={rows.length} />
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">Add Expense</h2>
            <form onSubmit={handleAddExpense} className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                required
              />
              <input
                type="text"
                placeholder="Type (Electricity, Salary...)"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                required
              />
              <input
                type="number"
                min={0}
                step={0.01}
                inputMode="decimal"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                onBlur={() => {
                  if (amountInput.trim() === '') return;
                  const parsed = Number(amountInput);
                  if (!Number.isFinite(parsed) || parsed < 0) {
                    setAmountInput('0');
                    return;
                  }
                  setAmountInput(String(parsed));
                }}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                required
              />
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Add Expense'}
              </button>
            </form>
          </div>

          {loading ? (
            <p className="text-slate-400">Loading expenses...</p>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-800 border-b border-slate-700">
                  <tr>
                    <th className="px-6 py-3 text-left font-bold text-amber-400">Date</th>
                    <th className="px-6 py-3 text-left font-bold text-amber-400">Type</th>
                    <th className="px-6 py-3 text-right font-bold text-amber-400">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-800 transition">
                      <td className="px-6 py-3">{row.date}</td>
                      <td className="px-6 py-3">{row.type}</td>
                      <td className="px-6 py-3 text-right">{inrFormatter.format(Number(row.amount ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


