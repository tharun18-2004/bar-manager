'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import StatCard from '@/components/StatCard';
import VoidModal from '@/components/VoidModal';
import PageHeader from '@/components/PageHeader';
import AppToast from '@/components/AppToast';
import { authFetch } from '@/lib/auth-fetch';
import { addItemToOrder } from '@/lib/employee-order';
import { formatError } from '@/lib/errors';
import { useRouteGuard } from '@/lib/route-guard';

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  quantity: number;
}

export default function EmployeePage() {
  const { isChecking, isAuthorized, role } = useRouteGuard(['staff', 'manager', 'owner']);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [voidModal, setVoidModal] = useState(false);
  const [selectedItemToVoid, setSelectedItemToVoid] = useState<OrderItem | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const fetchMenuItems = useCallback(async () => {
    try {
      const res = await authFetch('/api/inventory');
      const { data } = await res.json();
      if (data) {
        const formattedMenuItems = data.map((item: any) => ({
          id: String(item.id),
          name: item.item_name,
          price: Number(item.unit_price),
          category: item.category,
          quantity: Number(item.quantity),
        }));
        setMenuItems(formattedMenuItems);
      }
    } catch (error) {
      console.error('Failed to fetch menu items:', error);
    }
  }, []);

  useEffect(() => {
    if (!isAuthorized) return;
    void fetchMenuItems();
  }, [fetchMenuItems, isAuthorized]);

  if (isChecking) {
    return <div className="min-h-screen bg-slate-100 text-slate-700 flex items-center justify-center">Checking access...</div>;
  }

  if (!isAuthorized) return null;

  const filteredItems = menuItems.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const addToOrder = (item: MenuItem) => {
    setOrderItems((prev) => {
      const { nextItems, message } = addItemToOrder(prev, item);
      if (message) {
        setToast({ type: 'info', message });
      }
      return nextItems;
    });
  };

  const removeFromOrder = (id: string) => {
    setOrderItems(orderItems.filter(item => item.id !== id));
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromOrder(id);
    } else {
      setOrderItems(orderItems.map(item =>
        item.id === id ? { ...item, quantity } : item
      ));
    }
  };

  const openVoidModal = (item: OrderItem) => {
    setSelectedItemToVoid(item);
    setVoidModal(true);
  };

  const handleVoidConfirm = async (_reason: string) => {
    if (!selectedItemToVoid) return;

    setLoading(true);
    try {
      removeFromOrder(selectedItemToVoid.id);
      setToast({ type: 'success', message: `Removed from order: ${selectedItemToVoid.name}` });
    } catch (error) {
      setToast({ type: 'error', message: `Failed to void item: ${formatError(error)}` });
    } finally {
      setLoading(false);
      setVoidModal(false);
      setSelectedItemToVoid(null);
    }
  };

  const totalPrice = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalItems = orderItems.reduce((sum, item) => sum + item.quantity, 0);
  const canAdjustInventory = role === 'manager' || role === 'owner';

  const handleDownloadInvoicePdf = async () => {
    if (orderItems.length === 0) {
      setToast({ type: 'info', message: 'Add items before downloading invoice.' });
      return;
    }

    try {
      const { generateInvoicePDF, downloadPDF } = await import('@/lib/pdf');
      const orderId = `INV-${Date.now()}`;
      const doc = generateInvoicePDF({
        orderId,
        staffName: 'Employee',
        items: orderItems.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.price,
        })),
      });
      downloadPDF(doc, `${orderId}.pdf`);
    } catch (error) {
      setToast({ type: 'error', message: `Failed to generate invoice: ${formatError(error)}` });
    }
  };

  const completeOrder = async () => {
    if (orderItems.length === 0) {
      setToast({ type: 'info', message: 'Add items to order first.' });
      return;
    }

    setLoading(true);
    try {
      for (const item of orderItems) {
        await authFetch('/api/sales', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item_name: item.name,
            amount: item.price * item.quantity,
            staff_name: 'Employee',
          }),
        });

        if (canAdjustInventory) {
          const currentInventoryItem = menuItems.find(menuItem => menuItem.id === item.id);
          if (currentInventoryItem) {
            const newQuantity = currentInventoryItem.quantity - item.quantity;
            await authFetch('/api/inventory', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: item.id, quantity: newQuantity }),
            });
          }
        }
      }

      setToast({ type: 'success', message: `Order placed. Total: $${totalPrice.toFixed(2)}` });
      setOrderItems([]);
      await fetchMenuItems();
    } catch (error) {
      setToast({ type: 'error', message: `Failed to complete order: ${formatError(error)}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-100 text-slate-900">
      <Sidebar role={role} />
      {toast && <AppToast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      <div className="flex-1 flex flex-col min-w-0">
        <PageHeader title="POS Terminal" role={role} />

        <div className="flex-1 flex gap-6 p-8 overflow-hidden">
          <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search menu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-400"
              />
            </div>

            <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-4 pr-4">
              {filteredItems.map((item) => (
                <article
                  key={item.id}
                  className="bg-slate-50 border border-slate-200 p-4 rounded-2xl text-left transition shadow-sm"
                >
                  <div className="h-24 rounded-xl bg-gradient-to-br from-blue-100 to-slate-200 mb-3 flex items-center justify-center text-slate-700 font-bold text-lg">
                    {item.name.slice(0, 2).toUpperCase()}
                  </div>
                  <p className="font-bold text-lg text-slate-900">{item.name}</p>
                  <p className="text-slate-500 text-sm">{item.category}</p>
                  <p className="text-blue-700 font-bold mt-2">${item.price.toFixed(2)}</p>
                  <p className={`text-xs mt-1 ${item.quantity <= 0 ? 'text-rose-500' : 'text-slate-500'}`}>
                    {item.quantity <= 0 ? 'Out of stock' : `${item.quantity} in stock`}
                  </p>
                  <button
                    type="button"
                    onClick={() => addToOrder(item)}
                    disabled={item.quantity <= 0}
                    className="mt-4 w-full rounded-xl bg-blue-600 text-white font-semibold py-2 hover:bg-blue-500 disabled:bg-slate-300 disabled:text-slate-600"
                  >
                    Add to cart
                  </button>
                </article>
              ))}
              {!loading && filteredItems.length === 0 && (
                <p className="col-span-2 text-slate-500 text-center py-8">
                  {searchQuery ? 'No menu items match your search.' : 'No menu items available.'}
                </p>
              )}
            </div>
          </div>

          <div className="w-96 flex flex-col bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-2xl font-bold mb-4 text-slate-900">Cart</h2>

            <div className="flex-1 overflow-y-auto mb-6 pr-2">
              {orderItems.length === 0 ? (
                <p className="text-slate-500 text-center py-8">No items added</p>
              ) : (
                <div className="space-y-3">
                  {orderItems.map(item => (
                    <div
                      key={item.id}
                      className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex justify-between items-center group"
                    >
                      <div className="flex-1">
                        <p className="font-semibold text-slate-800">{item.name}</p>
                        <p className="text-slate-500 text-sm">${item.price.toFixed(2)} each</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="bg-rose-600 hover:bg-rose-500 text-white px-2 py-1 rounded text-sm font-bold"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-bold text-slate-800">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded text-sm font-bold"
                        >
                          +
                        </button>
                      </div>
                      <p className="w-16 text-right font-bold text-blue-700">
                        ${(item.price * item.quantity).toFixed(2)}
                      </p>
                      <button
                        onClick={() => openVoidModal(item)}
                        className="ml-2 px-2 py-1 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded text-xs font-bold opacity-0 group-hover:opacity-100 transition"
                        title="Void this item"
                      >
                        X
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <StatCard label="Items" value={totalItems.toString()} />
              <StatCard label="Total" value={`$${totalPrice.toFixed(2)}`} />
            </div>

            {!canAdjustInventory && (
              <p className="text-xs text-slate-500 mb-3">
                Inventory updates require manager or owner permissions.
              </p>
            )}

            <div className="space-y-3">
              <button
                onClick={completeOrder}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 text-white disabled:text-slate-600 font-bold py-3 rounded-xl transition"
              >
                {loading ? 'Processing...' : 'Complete Order'}
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadInvoicePdf()}
                disabled={loading || orderItems.length === 0}
                className="w-full bg-slate-900 hover:bg-slate-700 disabled:bg-slate-300 text-white disabled:text-slate-600 font-bold py-3 rounded-xl transition"
              >
                Download Invoice PDF
              </button>
              <button
                onClick={() => setOrderItems([])}
                disabled={loading}
                className="w-full bg-white hover:bg-slate-100 disabled:bg-slate-200 border border-slate-300 text-slate-700 font-bold py-3 rounded-xl transition"
              >
                Clear Order
              </button>
            </div>
          </div>
        </div>
      </div>

      <VoidModal
        isOpen={voidModal}
        onClose={() => {
          setVoidModal(false);
          setSelectedItemToVoid(null);
        }}
        onConfirm={handleVoidConfirm}
        loading={loading}
      />
    </div>
  );
}
