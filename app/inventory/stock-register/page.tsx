'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { CellValueChangedEvent, ColDef, ICellRendererParams } from 'ag-grid-community';
import Sidebar from '@/components/Sidebar';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import AppToast from '@/components/AppToast';
import { authFetch } from '@/lib/auth-fetch';
import { formatError } from '@/lib/errors';
import { useRouteGuard } from '@/lib/route-guard';

type StockRow = {
  item_id: string;
  brand_name: string;
  opening_balance: number;
  received: number;
  closing_balance: number;
  sale: number;
  unit_price: number;
  amount: number;
};

type DayLockState = {
  isLocked: boolean;
  lockedByEmail: string | null;
  lockedAt: string | null;
};

function toInteger(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

function calculateTotal(row: StockRow) {
  return toInteger(row.opening_balance) + toInteger(row.received);
}

function calculateClosing(row: StockRow) {
  return toInteger(row.closing_balance);
}

function calculateSale(row: StockRow) {
  return Math.max(0, calculateTotal(row) - calculateClosing(row));
}

function toDateParts(dateValue: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return {
      year: Number(dateValue.slice(0, 4)),
      month: Number(dateValue.slice(5, 7)),
      day: Number(dateValue.slice(8, 10)),
    };
  }
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

function makeDateString(year: number, month: number, day: number) {
  const maxDay = new Date(year, month, 0).getDate();
  const safeDay = Math.min(Math.max(day, 1), maxDay);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default function StockRegisterPage() {
  const { isChecking, isAuthorized, role } = useRouteGuard(['staff', 'owner'], { unauthorizedRedirect: '/pos' });
  const gridRef = useRef<AgGridReact<StockRow>>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<StockRow[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [dayLock, setDayLock] = useState<DayLockState>({ isLocked: false, lockedByEmail: null, lockedAt: null });
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const timezoneOffsetMinutes = new Date().getTimezoneOffset();
  const canEditRegister = role === 'owner' && !dayLock.isLocked;

  const handleMonthChange = (month: number) => {
    const parts = toDateParts(selectedDate);
    setSelectedMonth(month);
    setSelectedDate(makeDateString(selectedYear, month, parts.day));
  };

  const handleYearChange = (year: number) => {
    const safeYear = Math.max(2000, Math.min(2100, year));
    const parts = toDateParts(selectedDate);
    setSelectedYear(safeYear);
    setSelectedDate(makeDateString(safeYear, selectedMonth, parts.day));
  };

  const handleDateChange = (dateValue: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return;
    const parts = toDateParts(dateValue);
    setSelectedDate(dateValue);
    setSelectedMonth(parts.month);
    setSelectedYear(parts.year);
  };

  const fetchRegister = useCallback(async (month: number, year: number, date: string) => {
    setLoading(true);
    try {
      const res = await authFetch(
        `/api/stock-register?month=${month}&year=${year}&date=${encodeURIComponent(date)}&tz_offset=${encodeURIComponent(
          String(timezoneOffsetMinutes)
        )}`
      );
      const payload = await res.json();
      if (!payload?.success) {
        const baseMessage = typeof payload?.error === 'string' ? payload.error : 'Failed to load stock register';
        throw new Error(baseMessage);
      }

      const mapped = (Array.isArray(payload.data) ? payload.data : []).map((row: any) => ({
        item_id: String(row.item_id),
        brand_name: String(row.brand_name ?? ''),
        opening_balance: toInteger(row.opening_balance),
        received: toInteger(row.received),
        closing_balance: toInteger(row.closing_balance),
        sale: toInteger(row.sale),
        unit_price: Number(row.unit_price ?? 0),
        amount: Number(row.amount ?? 0),
      }));
      setRows(mapped);
      setDayLock({
        isLocked: Boolean(payload.is_day_locked),
        lockedByEmail: typeof payload.locked_by_email === 'string' ? payload.locked_by_email : null,
        lockedAt: typeof payload.locked_at === 'string' ? payload.locked_at : null,
      });
    } catch (error) {
      setToast({ type: 'error', message: formatError(error) });
      setRows([]);
      setDayLock({ isLocked: false, lockedByEmail: null, lockedAt: null });
    } finally {
      setLoading(false);
    }
  }, [timezoneOffsetMinutes]);

  useEffect(() => {
    if (!isAuthorized) return;
    void fetchRegister(selectedMonth, selectedYear, selectedDate);
  }, [isAuthorized, selectedMonth, selectedYear, selectedDate, fetchRegister]);

  const computedRows = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        total: calculateTotal(row),
        sale: calculateSale(row),
        closing: calculateClosing(row),
        amount: Number((calculateSale(row) * Number(row.unit_price || 0)).toFixed(2)),
      })),
    [rows]
  );

  const summary = useMemo(
    () =>
      computedRows.reduce(
        (acc, row) => {
          acc.totalSale += row.sale;
          acc.remaining += row.closing;
          acc.revenue += Number(row.amount ?? 0);
          return acc;
        },
        { totalSale: 0, remaining: 0, revenue: 0 }
      ),
    [computedRows]
  );

  const handlePrintDaySheet = useCallback(() => {
    if (loading) {
      setToast({ type: 'info', message: 'Please wait until stock register is loaded.' });
      return;
    }
    if (computedRows.length === 0) {
      setToast({ type: 'info', message: 'No rows to print for selected day.' });
      return;
    }

    const printedAt = new Date().toLocaleString();
    const summaryRevenue = `INR ${summary.revenue.toFixed(2)}`;
    const printTotals = computedRows.reduce(
      (acc, row) => {
        const opening = toInteger(row.opening_balance);
        const received = toInteger(row.received);
        const total = calculateTotal(row);
        const closing = calculateClosing(row);
        const sale = calculateSale(row);
        const amount = Number(row.amount ?? 0);
        acc.opening += opening;
        acc.received += received;
        acc.total += total;
        acc.closing += closing;
        acc.sale += sale;
        acc.amount += amount;
        return acc;
      },
      { opening: 0, received: 0, total: 0, closing: 0, sale: 0, amount: 0 }
    );
    const rowsHtml = computedRows
      .map((row) => {
        const total = calculateTotal(row);
        const closing = calculateClosing(row);
        const sale = calculateSale(row);
        const rate = Number(row.unit_price ?? 0).toFixed(2);
        const amount = Number(row.amount ?? 0).toFixed(2);
        return `
          <tr>
            <td>${escapeHtml(String(row.brand_name ?? ''))}</td>
            <td class="num">${toInteger(row.opening_balance)}</td>
            <td class="num">${toInteger(row.received)}</td>
            <td class="num">${total}</td>
            <td class="num">${closing}</td>
            <td class="num">${sale}</td>
            <td class="num">INR ${rate}</td>
            <td class="num">INR ${amount}</td>
          </tr>
        `;
      })
      .join('');

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Stock Register Day Sheet - ${escapeHtml(selectedDate)}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; color: #111; }
            h1 { margin: 0 0 6px; font-size: 20px; }
            .meta { margin: 0 0 12px; font-size: 12px; color: #444; }
            .summary { display: flex; gap: 18px; margin: 0 0 12px; font-size: 13px; }
            .summary strong { margin-right: 4px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #d1d5db; padding: 8px; font-size: 12px; }
            th { background: #f3f4f6; text-align: left; }
            tfoot td { font-weight: 700; background: #f8fafc; }
            td.num, th.num { text-align: right; }
            @media print { body { margin: 12mm; } }
          </style>
        </head>
        <body>
          <h1>Stock Register Day Sheet</h1>
          <p class="meta">Date: ${escapeHtml(selectedDate)} | Printed At: ${escapeHtml(printedAt)}</p>
          <div class="summary">
            <span><strong>Total Bottles Sold:</strong> ${summary.totalSale}</span>
            <span><strong>Remaining Stock:</strong> ${summary.remaining}</span>
            <span><strong>Revenue:</strong> ${summaryRevenue}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Item Name</th>
                <th class="num">Opening</th>
                <th class="num">Received</th>
                <th class="num">Total</th>
                <th class="num">Closing</th>
                <th class="num">Sale</th>
                <th class="num">Rate</th>
                <th class="num">Amount</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
            <tfoot>
              <tr>
                <td>TOTAL</td>
                <td class="num">${printTotals.opening}</td>
                <td class="num">${printTotals.received}</td>
                <td class="num">${printTotals.total}</td>
                <td class="num">${printTotals.closing}</td>
                <td class="num">${printTotals.sale}</td>
                <td class="num">-</td>
                <td class="num">INR ${printTotals.amount.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </body>
      </html>
    `;

    const triggerPrintAfterRender = (targetWindow: Window, cleanup?: () => void) => {
      const tryPrint = () => {
        const targetDoc = targetWindow.document;
        if (!targetDoc || targetDoc.readyState !== 'complete') {
          window.setTimeout(tryPrint, 60);
          return;
        }

        const doPrint = () => {
          targetWindow.focus();
          targetWindow.print();
          if (cleanup) {
            window.setTimeout(cleanup, 900);
          }
        };

        const proceedAfterPaint = () => {
          targetWindow.requestAnimationFrame(() => {
            targetWindow.requestAnimationFrame(() => {
              window.setTimeout(doPrint, 120);
            });
          });
        };

        const fonts = (targetDoc as any).fonts;
        if (fonts?.ready && typeof fonts.ready.then === 'function') {
          fonts.ready.then(proceedAfterPaint).catch(proceedAfterPaint);
          return;
        }

        proceedAfterPaint();
      };

      tryPrint();
    };
    
    // Use a single hidden iframe print path to avoid an initial blank popup page.
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    document.body.appendChild(iframe);

    const iframeWindow = iframe.contentWindow;
    if (!iframeWindow) {
      document.body.removeChild(iframe);
      setToast({ type: 'error', message: 'Print failed. Please try again.' });
      return;
    }
    
    let printed = false;
    iframe.srcdoc = html;
    iframe.onload = () => {
      if (printed) return;
      printed = true;
      triggerPrintAfterRender(iframeWindow, () => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
      });
    };
  }, [computedRows, loading, selectedDate, summary.remaining, summary.revenue, summary.totalSale]);

  const handleCellValueChanged = useCallback((event: CellValueChangedEvent<StockRow>) => {
    if (!canEditRegister) return;
    const itemId = String(event.data?.item_id ?? '');
    const col = event.colDef.field;
    if (!itemId || !col) return;
    if (col !== 'opening_balance' && col !== 'received' && col !== 'closing_balance') return;
    const parsed = toInteger(event.newValue);
    setRows((prev) => prev.map((row) => (row.item_id === itemId ? { ...row, [col]: parsed } : row)));
  }, [canEditRegister]);

  const handleEditRow = useCallback((itemId: string) => {
    if (!canEditRegister) {
      setToast({ type: 'info', message: role !== 'owner' ? 'Only owner can edit stock register.' : 'Day is locked. Editing is disabled.' });
      return;
    }
    const api = gridRef.current?.api;
    if (!api) return;

    let rowIndex = -1;
    api.forEachNode((node) => {
      if (String(node.data?.item_id ?? '') === itemId) {
        rowIndex = node.rowIndex ?? -1;
      }
    });
    if (rowIndex < 0) return;

    api.ensureIndexVisible(rowIndex, 'middle');
    api.startEditingCell({ rowIndex, colKey: 'opening_balance' });
  }, [canEditRegister, role]);

  const columnDefs = useMemo<ColDef<StockRow>[]>(
    () => [
      { headerName: 'Item Name', field: 'brand_name', editable: false, minWidth: 220, pinned: 'left' },
      {
        headerName: 'Opening Balance (OB)',
        field: 'opening_balance',
        editable: canEditRegister,
        valueParser: (params) => toInteger(params.newValue),
        type: 'numericColumn',
        minWidth: 140,
      },
      {
        headerName: 'Received',
        field: 'received',
        editable: canEditRegister,
        valueParser: (params) => toInteger(params.newValue),
        type: 'numericColumn',
        minWidth: 120,
      },
      {
        headerName: 'Total (OB + Received)',
        editable: false,
        valueGetter: (params) => calculateTotal(params.data as StockRow),
        type: 'numericColumn',
        minWidth: 150,
      },
      {
        headerName: 'Closing Balance (CB)',
        field: 'closing_balance',
        editable: canEditRegister,
        valueParser: (params) => toInteger(params.newValue),
        type: 'numericColumn',
        minWidth: 150,
      },
      {
        headerName: 'Sale (Total - CB)',
        editable: false,
        valueGetter: (params) => calculateSale(params.data as StockRow),
        type: 'numericColumn',
        minWidth: 150,
      },
      {
        headerName: 'Rate',
        field: 'unit_price',
        editable: false,
        minWidth: 120,
        valueFormatter: (params) => `INR ${Number(params.value ?? 0).toFixed(2)}`,
      },
      {
        headerName: 'Amount',
        editable: false,
        minWidth: 120,
        valueGetter: (params) => Number((calculateSale(params.data as StockRow) * Number(params.data?.unit_price ?? 0)).toFixed(2)),
        valueFormatter: (params) => `INR ${Number(params.value ?? 0).toFixed(2)}`,
      },
      {
        headerName: 'Actions',
        editable: false,
        minWidth: 110,
        pinned: 'right',
        cellRenderer: (params: ICellRendererParams<StockRow>) => {
          const rowItemId = String(params.data?.item_id ?? '');
          return (
            <button
              type="button"
              onClick={() => handleEditRow(rowItemId)}
              disabled={!canEditRegister || !rowItemId}
              className="rounded bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-300 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              Edit
            </button>
          );
        },
      },
    ],
    [canEditRegister, handleEditRow]
  );

  const defaultColDef = useMemo<ColDef<StockRow>>(
    () => ({
      sortable: false,
      filter: false,
      resizable: true,
      singleClickEdit: true,
    }),
    []
  );

  const handleSave = async () => {
    if (role !== 'owner') {
      setToast({ type: 'error', message: 'Only owner can edit stock register.' });
      return;
    }
    if (dayLock.isLocked) {
      setToast({ type: 'info', message: 'Day is locked. Editing is disabled.' });
      return;
    }

    setSaving(true);
    try {
      const payloadRows = rows.map((row) => ({
        item_id: row.item_id,
        opening_balance: toInteger(row.opening_balance),
        received: toInteger(row.received),
        closing_balance: toInteger(row.closing_balance),
      }));
      const res = await authFetch('/api/stock-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          year: selectedYear,
          date: selectedDate,
          tz_offset: timezoneOffsetMinutes,
          rows: payloadRows,
        }),
      });
      const payload = await res.json();
      if (!payload?.success) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to save stock register');
      }
      setToast({ type: 'success', message: 'Stock register saved successfully.' });
      await fetchRegister(selectedMonth, selectedYear, selectedDate);
    } catch (error) {
      setToast({ type: 'error', message: formatError(error) });
    } finally {
      setSaving(false);
    }
  };

  const handleLockDay = async () => {
    if (role !== 'owner') {
      setToast({ type: 'error', message: 'Only owner can lock the day.' });
      return;
    }
    if (dayLock.isLocked) {
      setToast({ type: 'info', message: 'This day is already locked.' });
      return;
    }

    try {
      const res = await authFetch('/api/stock-register/lock-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          month: selectedMonth,
          year: selectedYear,
        }),
      });
      const payload = await res.json();
      if (!payload?.success) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to lock day');
      }

      setToast({
        type: 'success',
        message: payload?.already_locked ? 'Day is already locked.' : 'Day locked successfully.',
      });
      await fetchRegister(selectedMonth, selectedYear, selectedDate);
    } catch (error) {
      setToast({ type: 'error', message: formatError(error) });
    }
  };

  const handleUnlockDay = async () => {
    if (role !== 'owner') {
      setToast({ type: 'error', message: 'Only owner can unlock the day.' });
      return;
    }
    if (!dayLock.isLocked) {
      setToast({ type: 'info', message: 'This day is already unlocked.' });
      return;
    }

    try {
      const res = await authFetch('/api/stock-register/unlock-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate }),
      });
      const payload = await res.json();
      if (!payload?.success) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to unlock day');
      }

      setToast({
        type: 'success',
        message: payload?.already_unlocked ? 'Day was already unlocked.' : 'Day unlocked successfully.',
      });
      await fetchRegister(selectedMonth, selectedYear, selectedDate);
    } catch (error) {
      setToast({ type: 'error', message: formatError(error) });
    }
  };

  if (isChecking) {
    return <div className="min-h-screen bg-slate-100 text-slate-700 flex items-center justify-center">Checking access...</div>;
  }
  if (!isAuthorized) return null;

  return (
    <div className="layout flex h-screen bg-slate-100 text-slate-900">
      <Sidebar role={role} />
      {toast && <AppToast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      <div className="main-content flex flex-col min-w-0">
        <PageHeader title="Stock Register" role={role} />

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard label="Total Bottles Sold" value={String(summary.totalSale)} />
            <StatCard label="Remaining Stock" value={String(summary.remaining)} />
            <StatCard label="Revenue" value={`INR ${summary.revenue.toFixed(2)}`} />
          </div>

          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Month</label>
              <select
                value={selectedMonth}
                onChange={(e) => handleMonthChange(Number(e.target.value))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                  <option key={month} value={month}>
                    {month.toString().padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Year</label>
              <input
                type="number"
                min={2000}
                max={2100}
                value={selectedYear}
                onChange={(e) => handleYearChange(toInteger(e.target.value))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm w-28"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={role !== 'owner' || dayLock.isLocked || saving || loading || rows.length === 0}
              className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-500 disabled:bg-slate-300 disabled:text-slate-600"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => void handleLockDay()}
              disabled={role !== 'owner' || dayLock.isLocked || loading}
              className="rounded-lg bg-amber-600 px-4 py-2 text-white font-semibold hover:bg-amber-500 disabled:bg-slate-300 disabled:text-slate-600"
            >
              Lock Day
            </button>
            <button
              type="button"
              onClick={() => void handleUnlockDay()}
              disabled={role !== 'owner' || !dayLock.isLocked || loading}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-white font-semibold hover:bg-emerald-500 disabled:bg-slate-300 disabled:text-slate-600"
            >
              Unlock Day
            </button>
            <button
              type="button"
              onClick={handlePrintDaySheet}
              disabled={loading || rows.length === 0}
              className="rounded-lg bg-slate-700 px-4 py-2 text-white font-semibold hover:bg-slate-600 disabled:bg-slate-300 disabled:text-slate-600"
            >
              Print Day Sheet
            </button>
            {dayLock.isLocked && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <p className="font-semibold">Locked</p>
                <p>
                  {dayLock.lockedByEmail ? `By: ${dayLock.lockedByEmail}` : 'By: Owner'}
                  {dayLock.lockedAt ? ` | At: ${new Date(dayLock.lockedAt).toLocaleString()}` : ''}
                </p>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="ag-theme-quartz h-[560px] w-full">
              <AgGridReact<StockRow>
                ref={gridRef}
                rowData={rows}
                columnDefs={columnDefs}
                defaultColDef={defaultColDef}
                getRowId={(params) => String(params.data.item_id)}
                onCellValueChanged={handleCellValueChanged}
                animateRows
                enterNavigatesVertically
                enterNavigatesVerticallyAfterEdit
                stopEditingWhenCellsLoseFocus
                loading={loading}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



