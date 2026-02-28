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

type TableStatus = 'available' | 'occupied' | 'cleaning' | 'needs_cleaning' | 'reserved';

interface Table {
  id: string;
  table_number: number | null;
  table_label?: string | null;
  capacity: number;
  status: TableStatus;
  customer_name?: string | null;
  order_amount?: number | null;
  order_reference?: string | null;
  created_at: string;
}

function normalizeStatus(status: TableStatus): 'available' | 'occupied' | 'cleaning' {
  if (status === 'reserved' || status === 'needs_cleaning') return 'cleaning';
  return status as 'available' | 'occupied' | 'cleaning';
}

function getDisplayLabel(table: Table) {
  if (table.table_label && table.table_label.trim().length > 0) return table.table_label;
  if (table.table_number !== null && table.table_number !== undefined) return `T${table.table_number}`;
  return `Table-${table.id}`;
}

export default function TablesPage() {
  const { isChecking, isAuthorized, role } = useRouteGuard(['staff', 'owner']);
  const [tables, setTables] = useState<Table[]>([]);
  const [tableStats, setTableStats] = useState<{ available: number; occupied: number; cleaning: number }>({
    available: 0,
    occupied: 0,
    cleaning: 0,
  });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [occupancyTarget, setOccupancyTarget] = useState<{ tableId: string } | null>(null);
  const [orderTarget, setOrderTarget] = useState<{ tableId: string } | null>(null);

  useEffect(() => {
    if (!isAuthorized) return;
    void fetchTables();
  }, [isAuthorized]);

  if (isChecking) {
    return <div className="min-h-screen bg-slate-100 text-slate-700 flex items-center justify-center">Checking access...</div>;
  }

  if (!isAuthorized) return null;

  const fetchTables = async () => {
    try {
      const res = await authFetch('/api/tables');
      const data = await res.json();
      setTables(Array.isArray(data.data) ? data.data : []);
      setTableStats({
        available: Number(data?.stats?.available ?? 0),
        occupied: Number(data?.stats?.occupied ?? 0),
        cleaning: Number(data?.stats?.cleaning ?? 0),
      });
    } catch (error) {
      setToast({ type: 'error', message: `Failed to fetch tables: ${formatError(error)}` });
    } finally {
      setLoading(false);
    }
  };

  const updateTable = async (
    tableId: string,
    payload: {
      status: 'available' | 'occupied' | 'cleaning';
      customer_name?: string;
      order_reference?: string;
      order_amount?: number;
    }
  ) => {
    try {
      await authFetch('/api/tables', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tableId, ...payload }),
      });
      await fetchTables();
      setSelectedTable(null);
    } catch (error) {
      setToast({ type: 'error', message: `Failed to update table: ${formatError(error)}` });
    }
  };

  const statusColors: Record<'available' | 'occupied' | 'cleaning', string> = {
    available: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    occupied: 'bg-amber-50 border-amber-200 text-amber-800',
    cleaning: 'bg-rose-50 border-rose-200 text-rose-700',
  };

  const statusEmoji: Record<'available' | 'occupied' | 'cleaning', string> = {
    available: '🟢',
    occupied: '🟡',
    cleaning: '🔴',
  };

  const normalizedTables = tables.map((table) => ({
    ...table,
    status: normalizeStatus(table.status),
  }));

  const occupiedTables = tableStats.occupied;
  const cleaningTables = tableStats.cleaning;
  const availableTables = tableStats.available;

  return (
    <div className="layout flex h-screen bg-slate-100 text-slate-900">
      <Sidebar role={role} />
      {toast && <AppToast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      <div className="main-content flex flex-col min-w-0">
        <PageHeader title="Table Management" role={role} />

        <div className="flex-1 p-8 overflow-y-auto">
          <div className="grid grid-cols-3 gap-6 mb-8">
            <StatCard label="Available" value={availableTables.toString()} type="success" />
            <StatCard label="Occupied" value={occupiedTables.toString()} />
            <StatCard label="Cleaning" value={cleaningTables.toString()} type="danger" />
          </div>

          {loading ? (
            <p className="text-slate-500">Loading tables...</p>
          ) : (
            normalizedTables.length === 0 ? (
              <p className="text-slate-500">No tables found in database.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {normalizedTables.map((table) => (
                  <button
                    key={table.id}
                    onClick={() => setSelectedTable(table)}
                    className={`p-5 rounded-2xl border-2 shadow-sm transition hover:-translate-y-0.5 ${
                      selectedTable?.id === table.id ? 'ring-2 ring-blue-400' : ''
                    } ${statusColors[table.status]}`}
                  >
                    <p className="text-3xl mb-1">{statusEmoji[table.status]}</p>
                    <p className="text-lg font-black">{getDisplayLabel(table)}</p>
                    <p className="text-xs opacity-80">Capacity: {table.capacity}</p>
                    <p className="text-xs mt-2 capitalize">{table.status.replace('_', ' ')}</p>
                    {table.customer_name && <p className="text-xs mt-1 truncate">Guest: {table.customer_name}</p>}
                    {table.order_reference && <p className="text-xs mt-1 truncate">Order: {table.order_reference}</p>}
                  </button>
                ))}
              </div>
            )
          )}

          {selectedTable && (
            <div className="fixed bottom-6 right-6 bg-white border border-slate-200 rounded-2xl p-6 w-96 shadow-xl">
              <h3 className="text-xl font-black mb-4">{getDisplayLabel(selectedTable)}</h3>

              <div className="space-y-2 mb-6 text-sm">
                <p>
                  <span className="text-slate-500">Status:</span>{' '}
                  <span className="font-bold capitalize">{normalizeStatus(selectedTable.status).replace('_', ' ')}</span>
                </p>
                <p>
                  <span className="text-slate-500">Capacity:</span>{' '}
                  <span className="font-bold">{selectedTable.capacity} guests</span>
                </p>
                {selectedTable.customer_name && (
                  <p>
                    <span className="text-slate-500">Guest:</span>{' '}
                    <span className="font-bold">{selectedTable.customer_name}</span>
                  </p>
                )}
                {selectedTable.order_reference && (
                  <p>
                    <span className="text-slate-500">Assigned Order:</span>{' '}
                    <span className="font-bold">{selectedTable.order_reference}</span>
                  </p>
                )}
              </div>

              <div className="space-y-2 mb-4">
                {normalizeStatus(selectedTable.status) === 'available' && (
                  <button
                    onClick={() => setOccupancyTarget({ tableId: selectedTable.id })}
                    className="w-full py-2 bg-amber-500 hover:bg-amber-400 rounded-xl font-bold transition"
                  >
                    Start Order
                  </button>
                )}

                {normalizeStatus(selectedTable.status) === 'occupied' && (
                  <>
                    <button
                      onClick={() => setOrderTarget({ tableId: selectedTable.id })}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition"
                    >
                      Assign / Update Order
                    </button>
                    <button
                      onClick={() => void updateTable(selectedTable.id, { status: 'cleaning' })}
                      className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition"
                    >
                      Close Bill
                    </button>
                  </>
                )}

                {normalizeStatus(selectedTable.status) === 'cleaning' && (
                  <button
                    onClick={() => void updateTable(selectedTable.id, { status: 'available' })}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition"
                  >
                    Mark Clean
                  </button>
                )}
              </div>

              <button
                onClick={() => setSelectedTable(null)}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold transition"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>

      <TextPromptModal
        isOpen={Boolean(occupancyTarget)}
        title="Mark Table Occupied"
        label="Customer Name"
        placeholder="Enter customer name"
        confirmLabel="Save"
        onCancel={() => setOccupancyTarget(null)}
        onConfirm={(name) => {
          if (occupancyTarget) {
            void updateTable(occupancyTarget.tableId, { status: 'occupied', customer_name: name });
            setOccupancyTarget(null);
          }
        }}
      />

      <TextPromptModal
        isOpen={Boolean(orderTarget)}
        title="Assign Order To Table"
        label="Order Reference"
        placeholder="e.g. BAR-2026-0001"
        confirmLabel="Assign"
        onCancel={() => setOrderTarget(null)}
        onConfirm={(orderReference) => {
          if (orderTarget) {
            void updateTable(orderTarget.tableId, { status: 'occupied', order_reference: orderReference });
            setOrderTarget(null);
          }
        }}
      />
    </div>
  );
}





