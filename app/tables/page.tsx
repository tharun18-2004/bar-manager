'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';
import AppToast from '@/components/AppToast';
import TextPromptModal from '@/components/TextPromptModal';
import { authFetch } from '@/lib/auth-fetch';
import { formatError } from '@/lib/errors';
import { useRouteGuard } from '@/lib/route-guard';

interface Table {
  id: string;
  table_number: number;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved';
  customer_name?: string;
  order_amount?: number;
  created_at: string;
}

export default function TablesPage() {
  const { isChecking, isAuthorized, role } = useRouteGuard(['staff', 'manager', 'owner']);
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [reservationTarget, setReservationTarget] = useState<{
    tableId: string;
    status: 'occupied' | 'reserved';
  } | null>(null);

  useEffect(() => {
    if (!isAuthorized) return;
    fetchTables();
  }, [isAuthorized]);

  if (isChecking) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center">Checking access...</div>;
  }

  if (!isAuthorized) return null;

  const fetchTables = async () => {
    try {
      const res = await authFetch('/api/tables');
      const data = await res.json();
      if (!data.data || data.data.length === 0) {
        const sampleTables = Array.from({ length: 12 }, (_, i) => ({
          id: `${i + 1}`,
          table_number: i + 1,
          capacity: i % 3 === 0 ? 2 : i % 3 === 1 ? 4 : 6,
          status: 'available' as const,
          created_at: new Date().toISOString(),
        }));
        setTables(sampleTables);
      } else {
        setTables(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch tables:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateTableStatus = async (
    tableId: string,
    newStatus: 'available' | 'occupied' | 'reserved',
    customerName?: string
  ) => {
    try {
      await authFetch('/api/tables', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tableId, status: newStatus, customer_name: customerName }),
      });
      fetchTables();
    } catch (error) {
      setToast({ type: 'error', message: `Failed to update table: ${formatError(error)}` });
    }
  };

  const statusColors = {
    available: 'bg-green-900 border-green-700 text-green-300',
    occupied: 'bg-blue-900 border-blue-700 text-blue-300',
    reserved: 'bg-yellow-900 border-yellow-700 text-yellow-300',
  };

  const statusBadge = {
    available: 'A',
    occupied: 'O',
    reserved: 'R',
  };

  const occupiedTables = tables.filter((t) => t.status === 'occupied').length;
  const reservedTables = tables.filter((t) => t.status === 'reserved').length;
  const availableTables = tables.filter((t) => t.status === 'available').length;

  return (
    <div className="flex h-screen bg-black text-white">
      <Sidebar role={role} />
      {toast && <AppToast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      <div className="flex-1 flex flex-col">
        <PageHeader title="TABLE MANAGEMENT" role={role} />

        <div className="flex-1 p-6 overflow-y-auto">
          <div className="grid grid-cols-3 gap-6 mb-8">
            <StatCard label="Available" value={availableTables.toString()} type="success" />
            <StatCard label="Occupied" value={occupiedTables.toString()} type="default" />
            <StatCard label="Reserved" value={reservedTables.toString()} type="danger" />
          </div>

          {loading ? (
            <p className="text-zinc-500">Loading tables...</p>
          ) : (
            <div className="grid grid-cols-4 gap-4">
              {tables.map((table) => (
                <button
                  key={table.id}
                  onClick={() => setSelectedTable(table)}
                  className={`p-6 rounded-lg border-2 transition hover:scale-105 ${
                    selectedTable?.id === table.id ? 'ring-2 ring-blue-500' : ''
                  } ${statusColors[table.status]}`}
                >
                  <div className="text-3xl font-bold mb-2">{statusBadge[table.status]}</div>
                  <p className="text-lg font-bold">Table {table.table_number}</p>
                  <p className="text-xs opacity-75">Capacity: {table.capacity}</p>
                  {table.customer_name && <p className="text-xs mt-2 truncate">{table.customer_name}</p>}
                </button>
              ))}
            </div>
          )}

          {selectedTable && (
            <div className="fixed bottom-6 right-6 bg-zinc-900 border border-zinc-800 rounded-lg p-6 w-96 shadow-2xl">
              <h3 className="text-xl font-bold mb-4">Table {selectedTable.table_number}</h3>

              <div className="space-y-2 mb-6">
                <p>
                  <span className="text-zinc-400">Status:</span>{' '}
                  <span className="font-bold capitalize">{selectedTable.status}</span>
                </p>
                <p>
                  <span className="text-zinc-400">Capacity:</span>{' '}
                  <span className="font-bold">{selectedTable.capacity} people</span>
                </p>
                {selectedTable.order_amount && (
                  <p>
                    <span className="text-zinc-400">Order Total:</span>{' '}
                    <span className="font-bold text-green-400">${selectedTable.order_amount.toFixed(2)}</span>
                  </p>
                )}
              </div>

              <div className="space-y-2 mb-4">
                {selectedTable.status === 'available' && (
                  <>
                    <button
                      onClick={() => setReservationTarget({ tableId: selectedTable.id, status: 'occupied' })}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded font-bold transition"
                    >
                      Mark Occupied
                    </button>
                    <button
                      onClick={() => setReservationTarget({ tableId: selectedTable.id, status: 'reserved' })}
                      className="w-full py-2 bg-yellow-600 hover:bg-yellow-700 rounded font-bold transition"
                    >
                      Make Reservation
                    </button>
                  </>
                )}

                {selectedTable.status !== 'available' && (
                  <button
                    onClick={() => updateTableStatus(selectedTable.id, 'available')}
                    className="w-full py-2 bg-green-600 hover:bg-green-700 rounded font-bold transition"
                  >
                    Mark Available
                  </button>
                )}
              </div>

              <button
                onClick={() => setSelectedTable(null)}
                className="w-full py-2 bg-zinc-700 hover:bg-zinc-600 rounded font-bold transition"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>

      <TextPromptModal
        isOpen={Boolean(reservationTarget)}
        title={reservationTarget?.status === 'reserved' ? 'Create Reservation' : 'Mark Table Occupied'}
        label="Customer Name"
        placeholder="Enter customer name"
        confirmLabel="Save"
        onCancel={() => setReservationTarget(null)}
        onConfirm={(name) => {
          if (reservationTarget) {
            void updateTableStatus(reservationTarget.tableId, reservationTarget.status, name);
            setReservationTarget(null);
          }
        }}
      />
    </div>
  );
}
