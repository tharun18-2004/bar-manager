'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';
import AppToast from '@/components/AppToast';
import { authFetch } from '@/lib/auth-fetch';
import { formatError } from '@/lib/errors';
import { useRouteGuard } from '@/lib/route-guard';

interface InventoryItem {
  id: string;
  item_name: string;
  brand_name: string;
  category: string;
  bottle_size_ml: number;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  current_stock_ml: number;
  quantity: number;
  unit_price: number;
  last_restocked?: string;
}

export default function InventoryPage() {
  const { isChecking, isAuthorized, role } = useRouteGuard(['owner'], { unauthorizedRedirect: '/pos' });
  const inrFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    item_name: '',
    brand_name: '',
    category: 'Whisky',
    bottle_size_ml: 750,
    cost_price: 0,
    selling_price: 0,
    stock_quantity: 0,
    current_stock_ml: 0,
  });

  useEffect(() => {
    if (!isAuthorized) return;
    fetchInventory();
  }, [isAuthorized]);

  if (isChecking) {
    return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Checking access...</div>;
  }

  if (!isAuthorized) return null;

  const fetchInventory = async () => {
    try {
      const res = await authFetch('/api/inventory');
      const data = await res.json();
      setInventory(data.data || []);
    } catch (error) {
      console.error('Failed to fetch inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await authFetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setToast({ type: 'success', message: 'Item added.' });
        setFormData({
          item_name: '',
          brand_name: '',
          category: 'Whisky',
          bottle_size_ml: 750,
          cost_price: 0,
          selling_price: 0,
          stock_quantity: 0,
          current_stock_ml: 0,
        });
        setShowAddForm(false);
        fetchInventory();
      }
    } catch (error) {
      setToast({ type: 'error', message: `Failed to add item: ${formatError(error)}` });
    }
  };

  const handleUpdateQuantity = async (id: string, newQuantity: number) => {
    try {
      const row = inventory.find((item) => item.id === id);
      const bottleSizeMl = Number(row?.bottle_size_ml ?? 750);
      await authFetch('/api/inventory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          stock_quantity: newQuantity,
          current_stock_ml: Math.max(0, newQuantity * bottleSizeMl),
        }),
      });
      fetchInventory();
    } catch (error) {
      setToast({ type: 'error', message: `Failed to update item: ${formatError(error)}` });
    }
  };

  const totalValue = inventory.reduce((sum, item) => sum + Number(item.stock_quantity ?? item.quantity ?? 0) * Number(item.cost_price ?? 0), 0);
  const lowStockItems = inventory.filter(item => Number(item.current_stock_ml ?? 0) < 180).length;

  return (
    <div className="flex h-screen bg-slate-950 text-white">
      <Sidebar role={role} />
      {toast && <AppToast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
      
      <div className="flex-1 flex flex-col">
        <PageHeader title="INVENTORY MANAGEMENT" role={role} />

        <div className="flex-1 p-6 overflow-y-auto">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-6 mb-8">
            <StatCard label="Total Items" value={inventory.length.toString()} />
            <StatCard label="Inventory Value" value={inrFormatter.format(totalValue)} />
            <StatCard label="Low Stock" value={lowStockItems.toString()} type="danger" />
          </div>

          {/* Add Item Form */}
          {showAddForm && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-bold mb-4">Add New Item</h2>
              <form onSubmit={handleAddItem} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="Item Name"
                    value={formData.item_name}
                    onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                    className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Brand Name"
                    value={formData.brand_name}
                    onChange={(e) => setFormData({ ...formData, brand_name: e.target.value })}
                    className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                    required
                  />
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                  >
                    <option>Beer</option>
                    <option>Whisky</option>
                    <option>Rum</option>
                    <option>Vodka</option>
                  </select>
                  <input
                    type="number"
                    placeholder="Bottle Size (ml)"
                    value={formData.bottle_size_ml}
                    onChange={(e) => setFormData({ ...formData, bottle_size_ml: Number(e.target.value) })}
                    className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                    required
                  />
                  <input
                    type="number"
                    placeholder="Cost Price"
                    step="0.01"
                    value={formData.cost_price}
                    onChange={(e) => setFormData({ ...formData, cost_price: Number(e.target.value) })}
                    className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                    required
                  />
                  <input
                    type="number"
                    placeholder="Selling Price (per peg)"
                    step="0.01"
                    value={formData.selling_price}
                    onChange={(e) => setFormData({ ...formData, selling_price: Number(e.target.value) })}
                    className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                    required
                  />
                  <input
                    type="number"
                    placeholder="Stock Quantity (bottles)"
                    value={formData.stock_quantity}
                    onChange={(e) => setFormData({ ...formData, stock_quantity: Number(e.target.value) })}
                    className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                    required
                  />
                  <input
                    type="number"
                    placeholder="Current Stock (ml)"
                    value={formData.current_stock_ml}
                    onChange={(e) => setFormData({ ...formData, current_stock_ml: Number(e.target.value) })}
                    className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                    required
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-lg transition"
                  >
                    ADD ITEM
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
              + ADD NEW ITEM
            </button>
          )}

          {/* Inventory Table */}
          {loading ? (
            <p className="text-slate-400">Loading inventory...</p>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-800 border-b border-slate-700">
                  <tr>
                    <th className="px-6 py-3 text-left font-bold text-amber-400">Item</th>
                    <th className="px-6 py-3 text-left font-bold text-amber-400">Brand</th>
                    <th className="px-6 py-3 text-left font-bold text-amber-400">Category</th>
                    <th className="px-6 py-3 text-center font-bold text-amber-400">Bottle (ml)</th>
                    <th className="px-6 py-3 text-center font-bold text-amber-400">Stock (Bottle)</th>
                    <th className="px-6 py-3 text-center font-bold text-amber-400">Current (ml)</th>
                    <th className="px-6 py-3 text-right font-bold text-amber-400">Cost</th>
                    <th className="px-6 py-3 text-right font-bold text-amber-400">Selling</th>
                    <th className="px-6 py-3 text-right font-bold text-amber-400">Inventory Value</th>
                    <th className="px-6 py-3 text-center font-bold text-amber-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {inventory.map(item => (
                    <tr key={item.id} className="hover:bg-slate-800 transition">
                      <td className="px-6 py-3 font-semibold">{item.item_name}</td>
                      <td className="px-6 py-3 text-slate-300">{item.brand_name ?? '-'}</td>
                      <td className="px-6 py-3 text-slate-300">{item.category}</td>
                      <td className="px-6 py-3 text-center">{item.bottle_size_ml ?? 750}</td>
                      <td className="px-6 py-3 text-center">
                        <span className={(item.stock_quantity ?? item.quantity) < 2 ? 'text-rose-300 font-bold' : 'text-emerald-300'}>
                          {item.stock_quantity ?? item.quantity}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-center">{item.current_stock_ml ?? 0}</td>
                      <td className="px-6 py-3 text-right">{inrFormatter.format(item.cost_price ?? 0)}</td>
                      <td className="px-6 py-3 text-right">{inrFormatter.format(item.selling_price ?? item.unit_price)}</td>
                      <td className="px-6 py-3 text-right font-bold text-emerald-300">
                        {inrFormatter.format((item.stock_quantity ?? item.quantity ?? 0) * (item.cost_price ?? 0))}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => handleUpdateQuantity(item.id, (item.stock_quantity ?? item.quantity ?? 0) + 1)}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-sm font-bold"
                          >
                            +
                          </button>
                          <button
                            onClick={() => handleUpdateQuantity(item.id, Math.max(0, (item.stock_quantity ?? item.quantity ?? 0) - 1))}
                            className="px-3 py-1 bg-rose-600 hover:bg-rose-500 rounded text-sm font-bold"
                          >
                            -
                          </button>
                        </div>
                      </td>
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
