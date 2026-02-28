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

interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  total_spent: number;
  visit_count: number;
  last_visit?: string;
  created_at: string;
}

export default function CustomersPage() {
  const { isChecking, isAuthorized, role } = useRouteGuard(['owner']);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({ name: '', phone: '', email: '' });
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    if (!isAuthorized) return;
    fetchCustomers();
  }, [isAuthorized]);

  if (isChecking) {
    return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Checking access...</div>;
  }

  if (!isAuthorized) return null;

  const fetchCustomers = async () => {
    try {
      const res = await authFetch('/api/customers');
      const data = await res.json();
      setCustomers(data.data || []);
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await authFetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setToast({ type: 'success', message: 'Customer added.' });
        setFormData({ name: '', phone: '', email: '' });
        setShowAddForm(false);
        fetchCustomers();
      }
    } catch (error) {
      setToast({ type: 'error', message: `Failed to add customer: ${formatError(error)}` });
    }
  };

  const handleEditCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;

    try {
      const res = await authFetch('/api/customers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingCustomer.id, ...formData }),
      });

      if (res.ok) {
        setToast({ type: 'success', message: 'Customer updated.' });
        setEditingCustomer(null);
        setFormData({ name: '', phone: '', email: '' });
        fetchCustomers();
      }
    } catch (error) {
      setToast({ type: 'error', message: `Failed to update customer: ${formatError(error)}` });
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    try {
      const res = await authFetch(`/api/customers?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setToast({ type: 'success', message: 'Customer deleted.' });
        fetchCustomers();
      }
      setDeletingCustomer(null);
    } catch (error) {
      setToast({ type: 'error', message: `Failed to delete customer: ${formatError(error)}` });
    }
  };

  const filteredCustomers = customers.filter(
    (c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.phone.includes(searchQuery)
  );

  const totalCustomers = customers.length;
  const totalRevenue = customers.reduce((sum, c) => sum + c.total_spent, 0);
  const avgSpent = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;

  return (
    <div className="layout flex h-screen bg-slate-950 text-white">
      <Sidebar role={role} />
      {toast && <AppToast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      <div className="main-content flex flex-col">
        <PageHeader title="CUSTOMER MANAGEMENT" role={role} />

        <div className="flex-1 p-6 overflow-y-auto">
          <div className="grid grid-cols-3 gap-6 mb-8">
            <StatCard label="Total Customers" value={totalCustomers.toString()} />
            <StatCard label="Total Revenue" value={`$${totalRevenue.toFixed(2)}`} />
            <StatCard label="Avg. Spent" value={`$${avgSpent.toFixed(2)}`} />
          </div>

          <div className="mb-6">
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
            />
          </div>

          {(showAddForm || editingCustomer) && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-bold mb-4">{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</h2>
              <form onSubmit={editingCustomer ? handleEditCustomer : handleAddCustomer} className="space-y-4">
                <input
                  type="text"
                  placeholder="Customer Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                  required
                />
                <input
                  type="tel"
                  placeholder="Phone Number"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                  required
                />
                <input
                  type="email"
                  placeholder="Email (optional)"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                />
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-lg transition"
                  >
                    {editingCustomer ? 'UPDATE CUSTOMER' : 'ADD CUSTOMER'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setEditingCustomer(null);
                      setFormData({ name: '', phone: '', email: '' });
                    }}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 rounded-lg transition"
                  >
                    CANCEL
                  </button>
                </div>
              </form>
            </div>
          )}

          {!showAddForm && !editingCustomer && (
            <button
              onClick={() => setShowAddForm(true)}
              className="mb-6 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-lg transition"
            >
              + ADD CUSTOMER
            </button>
          )}

          {loading ? (
            <p className="text-slate-400">Loading customers...</p>
          ) : (
            <div className="grid gap-4">
              {filteredCustomers.length === 0 ? (
                <p className="text-slate-400 text-center py-8">No customers found</p>
              ) : (
                filteredCustomers.map((customer) => (
                  <div key={customer.id} className="bg-slate-900 border border-slate-800 rounded-lg p-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-xl font-bold">{customer.name}</h3>
                        <p className="text-slate-300">Phone: {customer.phone}</p>
                        {customer.email && <p className="text-slate-300">Email: {customer.email}</p>}
                        <p className="text-slate-400 text-sm mt-2">
                          Member since {new Date(customer.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right flex gap-2">
                        <p className="text-2xl font-bold text-emerald-300">${customer.total_spent.toFixed(2)}</p>
                        <p className="text-slate-300 text-sm">{customer.visit_count} visits</p>
                        {customer.last_visit && (
                          <p className="text-slate-400 text-xs mt-2">
                            Last: {new Date(customer.last_visit).toLocaleDateString()}
                          </p>
                        )}
                        <button
                          onClick={() => {
                            setEditingCustomer(customer);
                            setFormData({ name: customer.name, phone: customer.phone, email: customer.email || '' });
                          }}
                          className="mt-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-semibold transition"
                        >
                          EDIT
                        </button>
                        <button
                          onClick={() => setDeletingCustomer(customer)}
                          className="mt-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 rounded-lg font-semibold transition"
                        >
                          DELETE
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={Boolean(deletingCustomer)}
        title="Delete Customer"
        message={deletingCustomer ? `Delete ${deletingCustomer.name}? This action cannot be undone.` : ''}
        confirmLabel="Delete"
        onCancel={() => setDeletingCustomer(null)}
        onConfirm={() => {
          if (deletingCustomer) {
            void handleDeleteCustomer(deletingCustomer.id);
          }
        }}
      />
    </div>
  );
}



