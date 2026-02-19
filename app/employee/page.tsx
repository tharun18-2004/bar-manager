'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import StatCard from '@/components/StatCard';
import VoidModal from '@/components/VoidModal';
import PageHeader from '@/components/PageHeader';
import AppToast from '@/components/AppToast';
import { authFetch } from '@/lib/auth-fetch';
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

  useEffect(() => {
    if (!isAuthorized) return;

    const fetchMenuItems = async () => {
      try {
        const res = await authFetch('/api/inventory');
        const { data } = await res.json();
        if (data) {
          const formattedMenuItems = data.map((item: any) => ({
            id: item.id,
            name: item.item_name,
            price: item.unit_price,
            category: item.category,
            quantity: item.quantity,
          }));
          setMenuItems(formattedMenuItems);
        }
      } catch (error) {
        console.error('Failed to fetch menu items:', error);
      }
    };

    fetchMenuItems();
  }, [isAuthorized]);

  if (isChecking) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center">Checking access...</div>;
  }

  if (!isAuthorized) return null;

  const filteredItems = menuItems.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const addToOrder = (item: MenuItem) => {
    const existingItem = orderItems.find(oi => oi.id === item.id);
    if (existingItem) {
      setOrderItems(orderItems.map(oi =>
        oi.id === item.id ? { ...oi, quantity: oi.quantity + 1 } : oi
      ));
    } else {
      setOrderItems([...orderItems, { ...item, quantity: 1 }]);
    }
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
    } catch (error) {
      setToast({ type: 'error', message: `Failed to complete order: ${formatError(error)}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-black text-white">
      <Sidebar role={role} />
      {toast && <AppToast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
      
      <div className="flex-1 flex flex-col">
        <PageHeader title="STAFF POS" role={role} />

        <div className="flex-1 flex gap-6 p-6 overflow-hidden">
          {/* Menu Section */}
          <div className="flex-1 flex flex-col">
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search menu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-4 pr-4">
              {filteredItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => addToOrder(item)}
                  className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 p-4 rounded-lg text-left transition group"
                >
                  <p className="font-bold text-lg group-hover:text-blue-400">{item.name}</p>
                  <p className="text-zinc-500 text-sm">{item.category}</p>
                  <p className="text-green-400 font-bold mt-2">${item.price.toFixed(2)}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Order Summary Section */}
          <div className="w-96 flex flex-col bg-zinc-900 border border-zinc-800 rounded-lg p-6">
            <h2 className="text-2xl font-bold mb-4 text-blue-500">ORDER SUMMARY</h2>

            <div className="flex-1 overflow-y-auto mb-6 pr-2">
              {orderItems.length === 0 ? (
                <p className="text-zinc-500 text-center py-8">No items added</p>
              ) : (
                <div className="space-y-3">
                  {orderItems.map(item => (
                    <div
                      key={item.id}
                      className="bg-zinc-800 p-3 rounded-lg flex justify-between items-center group"
                    >
                      <div className="flex-1">
                        <p className="font-semibold">{item.name}</p>
                        <p className="text-zinc-400 text-sm">${item.price.toFixed(2)} each</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-sm font-bold"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-bold">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-sm font-bold"
                        >
                          +
                        </button>
                      </div>
                      <p className="w-16 text-right font-bold text-green-400">
                        ${(item.price * item.quantity).toFixed(2)}
                      </p>
                      <button
                        onClick={() => openVoidModal(item)}
                        className="ml-2 px-2 py-1 bg-red-900 hover:bg-red-800 rounded text-xs font-bold opacity-0 group-hover:opacity-100 transition"
                        title="Void this item"
                      >
                        X
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <StatCard label="Items" value={totalItems.toString()} />
              <StatCard label="Total" value={`$${totalPrice.toFixed(2)}`} />
            </div>

            {!canAdjustInventory && (
              <p className="text-xs text-yellow-400 mb-3">
                Inventory updates require manager or owner permissions.
              </p>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={completeOrder}
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-zinc-700 text-white font-bold py-3 rounded-lg transition"
              >
                {loading ? 'PROCESSING...' : 'COMPLETE ORDER'}
              </button>
              <button
                onClick={() => setOrderItems([])}
                disabled={loading}
                className="w-full bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 text-white font-bold py-3 rounded-lg transition"
              >
                CLEAR ORDER
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

