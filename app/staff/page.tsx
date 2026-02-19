'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';
import AppToast from '@/components/AppToast';
import ConfirmModal from '@/components/ConfirmModal';
import { authFetch } from '@/lib/auth-fetch';
import { formatError } from '@/lib/errors';
import { useRouteGuard } from '@/lib/route-guard';

interface Staff {
  id: string;
  name: string;
  email: string;
  role: 'bartender' | 'waiter' | 'manager';
  created_at: string;
}

type StaffRole = Staff['role'];

export default function StaffPage() {
  const { isChecking, isAuthorized, role } = useRouteGuard(['owner']);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deletingStaff, setDeletingStaff] = useState<Staff | null>(null);
  const [formData, setFormData] = useState<{ name: string; email: string; role: StaffRole }>({
    name: '',
    email: '',
    role: 'bartender',
  });

  useEffect(() => {
    if (!isAuthorized) return;
    fetchStaff();
  }, [isAuthorized]);

  if (isChecking) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center">Checking access...</div>;
  }

  if (!isAuthorized) return null;

  const fetchStaff = async () => {
    try {
      const res = await authFetch('/api/staff');
      const data = await res.json();
      setStaff(data.data || []);
    } catch (error) {
      console.error('Failed to fetch staff:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await authFetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setToast({ type: 'success', message: 'Staff member added.' });
        setFormData({ name: '', email: '', role: 'bartender' });
        setShowAddForm(false);
        fetchStaff();
      }
    } catch (error) {
      setToast({ type: 'error', message: `Failed to add staff: ${formatError(error)}` });
    }
  };

  const handleDeleteStaff = async (id: string) => {
    try {
      const res = await authFetch(`/api/staff?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setToast({ type: 'success', message: 'Staff member deleted.' });
        fetchStaff();
      }
      setDeletingStaff(null);
    } catch (error) {
      setToast({ type: 'error', message: `Failed to delete staff member: ${formatError(error)}` });
    }
  };

  const roleColors = {
    bartender: 'bg-purple-900 text-purple-200',
    waiter: 'bg-blue-900 text-blue-200',
    manager: 'bg-red-900 text-red-200',
  };

  return (
    <div className="flex h-screen bg-black text-white">
      <Sidebar role={role} />
      {toast && <AppToast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
      
      <div className="flex-1 flex flex-col">
        <PageHeader title="STAFF MANAGEMENT" role={role} />

        <div className="flex-1 p-6 overflow-y-auto">
          <div className="mb-6">
            <StatCard label="Total Staff" value={staff.length.toString()} />
          </div>

          {showAddForm && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-bold mb-4">Add New Staff Member</h2>
              <form onSubmit={handleAddStaff} className="space-y-4">
                <input
                  type="text"
                  placeholder="Full Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  required
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  required
                />
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as StaffRole })}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="bartender">Bartender</option>
                  <option value="waiter">Waiter</option>
                  <option value="manager">Manager</option>
                </select>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded-lg transition"
                  >
                    ADD STAFF
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-white font-bold py-2 rounded-lg transition"
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
              className="mb-6 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition"
            >
              + ADD STAFF MEMBER
            </button>
          )}

          {loading ? (
            <p className="text-zinc-500">Loading staff...</p>
          ) : (
            <div className="grid gap-4">
              {staff.map(member => (
                <div key={member.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 flex justify-between items-center">
                  <div>
                    <h3 className="text-xl font-bold">{member.name}</h3>
                    <p className="text-zinc-400">{member.email}</p>
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold mt-2 ${roleColors[member.role]}`}>
                      {member.role.toUpperCase()}
                    </span>
                  </div>
                  <button
                    onClick={() => setDeletingStaff(member)}
                    className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition"
                  >
                    DELETE
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <ConfirmModal
        isOpen={Boolean(deletingStaff)}
        title="Delete Staff Member"
        message={
          deletingStaff
            ? `Delete ${deletingStaff.name}? This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        onCancel={() => setDeletingStaff(null)}
        onConfirm={() => {
          if (deletingStaff) {
            void handleDeleteStaff(deletingStaff.id);
          }
        }}
      />
    </div>
  );
}
