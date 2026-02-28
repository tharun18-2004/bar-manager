'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';
import AppToast from '@/components/AppToast';
import ConfirmModal from '@/components/ConfirmModal';
import { authFetch } from '@/lib/auth-fetch';
import { formatError } from '@/lib/errors';
import { useRouteGuard } from '@/lib/route-guard';

interface StaffAccount {
  id: string;
  name: string | null;
  email: string | null;
  role: 'staff' | 'owner';
  is_active: boolean;
  created_at: string;
}

export default function StaffPage() {
  const { isChecking, isAuthorized, role } = useRouteGuard(['owner']);
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deactivatingStaff, setDeactivatingStaff] = useState<StaffAccount | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'staff' as const,
  });

  useEffect(() => {
    if (!isAuthorized) return;
    void fetchStaff();
  }, [isAuthorized]);

  async function fetchStaff() {
    setLoading(true);
    try {
      const res = await authFetch('/api/staff');
      const data = await res.json();
      setStaff(data.data || []);
    } catch (error) {
      setToast({ type: 'error', message: `Failed to fetch staff accounts: ${formatError(error)}` });
    } finally {
      setLoading(false);
    }
  }

  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await authFetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to add staff account');
      }
      setToast({ type: 'success', message: 'Staff account created.' });
      setFormData({ name: '', email: '', password: '', role: 'staff' });
      setShowAddForm(false);
      await fetchStaff();
    } catch (error) {
      setToast({ type: 'error', message: `Failed to add staff account: ${formatError(error)}` });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivateStaff(id: string) {
    try {
      const res = await authFetch(`/api/staff?id=${id}`, { method: 'DELETE' });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to deactivate staff account');
      }
      setToast({ type: 'success', message: 'Staff account deactivated.' });
      await fetchStaff();
      setDeactivatingStaff(null);
    } catch (error) {
      setToast({ type: 'error', message: `Failed to deactivate staff account: ${formatError(error)}` });
    }
  }

  async function handleActivateStaff(id: string) {
    try {
      const res = await authFetch('/api/staff', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: true }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to activate staff account');
      }
      setToast({ type: 'success', message: 'Staff account activated.' });
      await fetchStaff();
    } catch (error) {
      setToast({ type: 'error', message: `Failed to activate staff account: ${formatError(error)}` });
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
        <PageHeader title="STAFF MANAGEMENT" role={role} />

        <div className="flex-1 p-6 overflow-y-auto">
          <div className="mb-6">
            <StatCard label="Active Staff" value={staff.filter((member) => member.is_active).length.toString()} />
          </div>

          {showAddForm && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-bold mb-4">Add Staff Account</h2>
              <form onSubmit={handleAddStaff} className="space-y-4">
                <input
                  type="text"
                  placeholder="Full Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                  required
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                  required
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                  required
                  minLength={6}
                />
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as 'staff' })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                >
                  <option value="staff">Staff</option>
                </select>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-lg transition disabled:opacity-60"
                  >
                    {submitting ? 'CREATING...' : 'ADD STAFF'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 rounded-lg transition"
                  >
                    CANCEL
                  </button>
                </div>
              </form>
            </div>
          )}

          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="mb-6 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-lg transition"
            >
              + ADD STAFF
            </button>
          )}

          {loading ? (
            <p className="text-slate-400">Loading staff...</p>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-800 border-b border-slate-700">
                  <tr>
                    <th className="px-6 py-3 text-left font-bold text-amber-400">Name</th>
                    <th className="px-6 py-3 text-left font-bold text-amber-400">Email</th>
                    <th className="px-6 py-3 text-left font-bold text-amber-400">Role</th>
                    <th className="px-6 py-3 text-left font-bold text-amber-400">Status</th>
                    <th className="px-6 py-3 text-left font-bold text-amber-400">Created At</th>
                    <th className="px-6 py-3 text-left font-bold text-amber-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {staff.map((member) => (
                    <tr key={member.id} className="hover:bg-slate-800 transition">
                      <td className="px-6 py-3">{member.name || '-'}</td>
                      <td className="px-6 py-3">{member.email || '-'}</td>
                      <td className="px-6 py-3 uppercase">{member.role}</td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-1 text-xs font-bold ${
                            member.is_active ? 'bg-emerald-700 text-emerald-100' : 'bg-slate-700 text-slate-200'
                          }`}
                        >
                          {member.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate-300">
                        {new Date(member.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-3">
                        {member.is_active ? (
                          <button
                            onClick={() => setDeactivatingStaff(member)}
                            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg transition"
                          >
                            DEACTIVATE
                          </button>
                        ) : (
                          <button
                            onClick={() => void handleActivateStaff(member.id)}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition"
                          >
                            ACTIVATE
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <ConfirmModal
        isOpen={Boolean(deactivatingStaff)}
        title="Deactivate Staff Account"
        message={
          deactivatingStaff
            ? `Deactivate ${deactivatingStaff.name ?? deactivatingStaff.email ?? 'this staff account'}? They will no longer be able to sign in.`
            : ''
        }
        confirmLabel="Deactivate"
        onCancel={() => setDeactivatingStaff(null)}
        onConfirm={() => {
          if (deactivatingStaff) {
            void handleDeactivateStaff(deactivatingStaff.id);
          }
        }}
      />
    </div>
  );
}


