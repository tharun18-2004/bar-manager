'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
  purchase_price: number;
  cost_price: number;
  selling_price: number;
  profit: number;
  stock_quantity: number;
  low_stock_alert: number;
  current_stock_ml: number;
  quantity: number;
  unit_price: number;
}

type InventoryFormState = {
  item_name: string;
  brand_name: string;
  category: string;
  volume_ml: number;
  portion_type: 'PLATE' | 'FULL' | 'HALF';
  purchase_price: number;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  low_stock_alert: number;
};

const DEFAULT_LOW_STOCK_THRESHOLD = 5;
const CATEGORY_OPTIONS = ['Beer', 'Hard Drinks', 'Soft Drinks', 'Food'];
const VOLUME_OPTIONS_ML = [250, 300, 330, 500, 650, 750, 1000] as const;
const FOOD_PORTION_OPTIONS: Array<{ value: 'PLATE' | 'FULL' | 'HALF'; label: string; bottle_size_ml: number }> = [
  { value: 'PLATE', label: 'Plate', bottle_size_ml: 3 },
  { value: 'FULL', label: 'Full', bottle_size_ml: 2 },
  { value: 'HALF', label: 'Half', bottle_size_ml: 1 },
];

const defaultForm: InventoryFormState = {
  item_name: '',
  brand_name: '',
  category: 'Beer',
  volume_ml: 750,
  portion_type: 'PLATE',
  purchase_price: 0,
  cost_price: 0,
  selling_price: 0,
  stock_quantity: 0,
  low_stock_alert: DEFAULT_LOW_STOCK_THRESHOLD,
};

function toNonNegativeInt(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.trunc(parsed));
}

function toNonNegativeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
}

function normalizeMrpPrice(value: unknown) {
  return toNonNegativeNumber(value, 0);
}

function normalizeOpeningStock(value: unknown) {
  return toNonNegativeInt(value, 0);
}

function normalizeLowStockAlert(value: unknown) {
  return toNonNegativeInt(value, DEFAULT_LOW_STOCK_THRESHOLD);
}

function normalizeLeadingZerosInput(
  event: React.FormEvent<HTMLInputElement>,
  parse: (value: string) => number
) {
  const target = event.currentTarget;
  if (target.value === '') return;
  const normalized = parse(target.value);
  if (!Number.isFinite(normalized)) return;
  const normalizedText = String(normalized);
  if (target.value !== normalizedText) {
    target.value = normalizedText;
  }
}

function toAllowedVolumeMl(value: unknown) {
  const parsed = toNonNegativeInt(value, 750);
  return VOLUME_OPTIONS_ML.includes(parsed as (typeof VOLUME_OPTIONS_ML)[number]) ? parsed : 750;
}

function isFoodCategory(value: string) {
  return value.trim().toLowerCase() === 'food';
}

function portionToBottleSizeMl(portionType: 'PLATE' | 'FULL' | 'HALF') {
  const matched = FOOD_PORTION_OPTIONS.find((option) => option.value === portionType);
  return matched?.bottle_size_ml ?? 3;
}

function bottleSizeMlToPortion(value: unknown): 'PLATE' | 'FULL' | 'HALF' {
  const parsed = toNonNegativeInt(value, 3);
  const matched = FOOD_PORTION_OPTIONS.find((option) => option.bottle_size_ml === parsed);
  return matched?.value ?? 'PLATE';
}

function foodPortionLabelFromBottleSizeMl(value: unknown) {
  const portion = bottleSizeMlToPortion(value);
  const matched = FOOD_PORTION_OPTIONS.find((option) => option.value === portion);
  return matched?.label ?? 'Plate';
}

export default function InventoryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isChecking, isAuthorized, role } = useRouteGuard(['owner'], { unauthorizedRedirect: '/pos' });
  const inrFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [formData, setFormData] = useState<InventoryFormState>(defaultForm);
  const [editData, setEditData] = useState<InventoryFormState>(defaultForm);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [hasHydratedFilters, setHasHydratedFilters] = useState(false);

  const fetchInventory = async () => {
    try {
      const res = await authFetch('/api/inventory');
      const data = await res.json();
      setInventory(Array.isArray(data.data) ? data.data : []);
    } catch (error) {
      setToast({ type: 'error', message: `Failed to fetch inventory: ${formatError(error)}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthorized) return;
    void fetchInventory();
  }, [isAuthorized]);

  const totalSkus = inventory.length;
  const totalStockBottles = useMemo(
    () => inventory.reduce((sum, item) => sum + Number(item.stock_quantity ?? item.quantity ?? 0), 0),
    [inventory]
  );
  const totalSellingValue = useMemo(
    () =>
      inventory.reduce(
        (sum, item) =>
          sum + Number(item.stock_quantity ?? item.quantity ?? 0) * Number(item.selling_price ?? item.unit_price ?? 0),
        0
      ),
    [inventory]
  );
  const totalPurchaseValue = useMemo(
    () =>
      inventory.reduce(
        (sum, item) =>
          sum + Number(item.stock_quantity ?? item.quantity ?? 0) * Number(item.purchase_price ?? item.cost_price ?? 0),
        0
      ),
    [inventory]
  );
  const totalProfitPotential = useMemo(() => totalSellingValue - totalPurchaseValue, [totalSellingValue, totalPurchaseValue]);
  const lowStockItems = useMemo(
    () =>
      inventory.filter((item) => {
        const stock = Number(item.stock_quantity ?? item.quantity ?? 0);
        const threshold = toNonNegativeInt(item.low_stock_alert, DEFAULT_LOW_STOCK_THRESHOLD);
        return stock < threshold;
      }).length,
    [inventory]
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 250);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    const q = (searchParams.get('q') ?? '').trim();
    const category = (searchParams.get('category') ?? 'All').trim();
    const normalizedCategory = category === 'All' || CATEGORY_OPTIONS.includes(category) ? category : 'All';
    setSearchQuery(q);
    setDebouncedSearchQuery(q);
    setCategoryFilter(normalizedCategory);
    setHasHydratedFilters(true);
  }, [searchParams]);

  useEffect(() => {
    if (!hasHydratedFilters) return;
    const params = new URLSearchParams(searchParams.toString());
    const q = debouncedSearchQuery.trim();
    if (q) params.set('q', q);
    else params.delete('q');
    if (categoryFilter !== 'All') params.set('category', categoryFilter);
    else params.delete('category');

    const nextQuery = params.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery === currentQuery) return;
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [debouncedSearchQuery, categoryFilter, hasHydratedFilters, pathname, router, searchParams]);

  const filteredInventory = useMemo(() => {
    const normalizedQuery = debouncedSearchQuery.trim().toLowerCase();
    return inventory.filter((item) => {
      const matchesCategory =
        categoryFilter === 'All' ||
        normalizeCategoryName(String(item.category ?? '')).toLowerCase() === categoryFilter.toLowerCase();
      if (!matchesCategory) return false;
      if (!normalizedQuery) return true;
      const haystack = [
        String(item.item_name ?? ''),
        String(item.brand_name ?? ''),
        String(item.category ?? ''),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [inventory, debouncedSearchQuery, categoryFilter]);

  if (isChecking) {
    return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Checking access...</div>;
  }

  if (!isAuthorized) return null;

  const handleApiError = async (res: Response, fallbackMessage: string) => {
    if (res.ok) return null;
    const payload = await res.json().catch(() => null);
    const errorMessage = typeof payload?.error === 'string' ? payload.error : fallbackMessage;
    throw new Error(errorMessage);
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const foodCategory = isFoodCategory(formData.category);
      const effectiveBottleSizeMl = foodCategory ? portionToBottleSizeMl(formData.portion_type) : formData.volume_ml;
      const normalizedSellingPrice = normalizeMrpPrice(formData.selling_price);
      const normalizedStockQuantity = normalizeOpeningStock(formData.stock_quantity);
      const payload = {
        ...formData,
        brand_name: foodCategory ? '' : formData.brand_name,
        selling_price: normalizedSellingPrice,
        stock_quantity: normalizedStockQuantity,
        bottle_size_ml: effectiveBottleSizeMl,
        purchase_price: formData.purchase_price,
        cost_price: formData.purchase_price > 0 ? formData.purchase_price : normalizedSellingPrice,
        current_stock_ml: normalizedStockQuantity * Math.max(1, Number(effectiveBottleSizeMl ?? 1)),
      };
      const res = await authFetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await handleApiError(res, 'Failed to add item');

      setToast({ type: 'success', message: 'Item added.' });
      setFormData(defaultForm);
      setShowAddForm(false);
      await fetchInventory();
    } catch (error) {
      setToast({ type: 'error', message: formatError(error) });
    }
  };

  const openEditModal = (item: InventoryItem) => {
    const category = item.category ?? 'Beer';
    const foodCategory = isFoodCategory(category);
    setEditingItemId(item.id);
    setEditData({
      item_name: item.item_name ?? '',
      brand_name: item.brand_name ?? '',
      category,
      volume_ml: toAllowedVolumeMl(item.bottle_size_ml),
      portion_type: foodCategory ? bottleSizeMlToPortion(item.bottle_size_ml) : 'PLATE',
      purchase_price: Number(item.purchase_price ?? item.cost_price ?? 0),
      cost_price: Number(item.cost_price ?? item.purchase_price ?? 0),
      selling_price: Number(item.selling_price ?? item.unit_price ?? 0),
      stock_quantity: Number(item.stock_quantity ?? item.quantity ?? 0),
      low_stock_alert: toNonNegativeInt(item.low_stock_alert, DEFAULT_LOW_STOCK_THRESHOLD),
    });
    setShowEditForm(true);
  };

  const handleEditItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItemId) return;
    try {
      const foodCategory = isFoodCategory(editData.category);
      const effectiveBottleSizeMl = foodCategory ? portionToBottleSizeMl(editData.portion_type) : editData.volume_ml;
      const normalizedSellingPrice = normalizeMrpPrice(editData.selling_price);
      const normalizedStockQuantity = normalizeOpeningStock(editData.stock_quantity);
      const res = await authFetch('/api/inventory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingItemId,
          ...editData,
          brand_name: foodCategory ? '' : editData.brand_name,
          selling_price: normalizedSellingPrice,
          stock_quantity: normalizedStockQuantity,
          bottle_size_ml: effectiveBottleSizeMl,
          purchase_price: editData.purchase_price,
          cost_price: editData.purchase_price > 0 ? editData.purchase_price : normalizedSellingPrice,
          current_stock_ml: normalizedStockQuantity * Math.max(1, Number(effectiveBottleSizeMl ?? 1)),
        }),
      });
      await handleApiError(res, 'Failed to update item');

      setToast({ type: 'success', message: 'Item updated.' });
      setShowEditForm(false);
      setEditingItemId(null);
      await fetchInventory();
    } catch (error) {
      setToast({ type: 'error', message: formatError(error) });
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (role !== 'owner') {
      setToast({ type: 'error', message: 'Only owner can delete items.' });
      return;
    }
    const confirmed = window.confirm('Delete this inventory item? This cannot be undone.');
    if (!confirmed) return;

    try {
      const res = await authFetch(`/api/inventory?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      await handleApiError(res, 'Failed to delete item');
      setToast({ type: 'success', message: 'Item deleted.' });
      await fetchInventory();
    } catch (error) {
      setToast({ type: 'error', message: formatError(error) });
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setCategoryFilter('All');
  };

  return (
    <div className="layout flex h-screen bg-slate-950 text-white">
      <Sidebar role={role} />
      {toast && <AppToast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      <div className="main-content flex flex-col min-w-0">
        <PageHeader title="INVENTORY MANAGEMENT" role={role} />

        <div className="flex-1 p-6 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6 mb-8">
            <StatCard label="Total Stock (Bottles)" value={totalStockBottles.toString()} subValue={`SKUs: ${totalSkus}`} />
            <StatCard label="Total Purchase Value" value={inrFormatter.format(totalPurchaseValue)} />
            <StatCard label="Total Selling Value" value={inrFormatter.format(totalSellingValue)} />
            <StatCard label="Profit Potential" value={inrFormatter.format(totalProfitPotential)} />
            <StatCard label="Low Stock (<5)" value={lowStockItems.toString()} type="danger" />
          </div>

          <div className="mb-6 flex flex-wrap gap-3 items-center">
            <button
              onClick={() => setShowAddForm(true)}
              className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-lg transition"
            >
              + ADD NEW ITEM
            </button>
            <button
              type="button"
              onClick={() => router.push('/inventory/stock-register')}
              className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition"
            >
              Excel Sheet
            </button>
          </div>

          <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="Search inventory (e.g., Kingfisher)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
            >
              <option value="All">All</option>
              {CATEGORY_OPTIONS.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={clearFilters}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-white font-semibold transition"
            >
              Clear Filters
            </button>
          </div>

          {(debouncedSearchQuery.trim() || categoryFilter !== 'All') && (
            <div className="mb-6 flex flex-wrap gap-2">
              {debouncedSearchQuery.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setDebouncedSearchQuery('');
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-blue-600/20 border border-blue-500/40 px-3 py-1 text-xs font-semibold text-blue-200"
                >
                  Search: {debouncedSearchQuery.trim()} <span aria-hidden>×</span>
                </button>
              )}
              {categoryFilter !== 'All' && (
                <button
                  type="button"
                  onClick={() => setCategoryFilter('All')}
                  className="inline-flex items-center gap-2 rounded-full bg-amber-500/20 border border-amber-400/40 px-3 py-1 text-xs font-semibold text-amber-200"
                >
                  Category: {categoryFilter} <span aria-hidden>×</span>
                </button>
              )}
            </div>
          )}

          {showAddForm && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-bold mb-4">Add New Item</h2>
              <p className="text-sm text-slate-400 mb-4">Category, item, and stock details in one clean form.</p>
              <form onSubmit={handleAddItem} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-300">Category</label>
                      <select
                        value={formData.category}
                        onChange={(e) => {
                          const nextCategory = e.target.value;
                          setFormData((prev) => ({
                            ...prev,
                            category: nextCategory,
                            brand_name: isFoodCategory(nextCategory) ? '' : prev.brand_name,
                          }));
                        }}
                        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                      >
                        {CATEGORY_OPTIONS.map((category) => (
                          <option key={category}>{category}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-300">Item Name</label>
                      <input
                        type="text"
                        placeholder="Kingfisher Strong"
                        value={formData.item_name}
                        onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                        required
                      />
                    </div>
                    {!isFoodCategory(formData.category) && (
                      <div>
                        <label className="mb-1 block text-sm font-semibold text-slate-300">Brand</label>
                        <input
                          type="text"
                          placeholder="United Breweries"
                          value={formData.brand_name}
                          onChange={(e) => setFormData({ ...formData, brand_name: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                          required
                        />
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    {isFoodCategory(formData.category) ? (
                      <div>
                        <label className="mb-1 block text-sm font-semibold text-slate-300">Portion</label>
                        <select
                          value={formData.portion_type}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              portion_type: e.target.value as InventoryFormState['portion_type'],
                            })
                          }
                          className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                          required
                        >
                          {FOOD_PORTION_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="mb-1 block text-sm font-semibold text-slate-300">Volume</label>
                        <select
                          value={formData.volume_ml}
                          onChange={(e) => setFormData({ ...formData, volume_ml: toAllowedVolumeMl(e.target.value) })}
                          className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                          required
                        >
                          {VOLUME_OPTIONS_ML.map((volume) => (
                            <option key={volume} value={volume}>
                              {volume} ml
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-300">Purchase Price (INR)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        inputMode="decimal"
                        placeholder="150"
                        value={formData.purchase_price}
                        onInput={(e) => normalizeLeadingZerosInput(e, normalizeMrpPrice)}
                        onChange={(e) => setFormData({ ...formData, purchase_price: toNonNegativeNumber(e.target.value, 0) })}
                        onBlur={() => setFormData({ ...formData, purchase_price: normalizeMrpPrice(formData.purchase_price) })}
                        className="no-spinner w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-300">Selling Price (INR)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        inputMode="decimal"
                        placeholder="180"
                        value={formData.selling_price}
                        onInput={(e) => normalizeLeadingZerosInput(e, normalizeMrpPrice)}
                        onChange={(e) => setFormData({ ...formData, selling_price: toNonNegativeNumber(e.target.value, 0) })}
                        onBlur={() => setFormData({ ...formData, selling_price: normalizeMrpPrice(formData.selling_price) })}
                        className="no-spinner w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-300">Opening Stock</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        placeholder="20"
                        value={formData.stock_quantity}
                        onInput={(e) => normalizeLeadingZerosInput(e, normalizeOpeningStock)}
                        onChange={(e) => setFormData({ ...formData, stock_quantity: toNonNegativeInt(e.target.value, 0) })}
                        onBlur={() => setFormData({ ...formData, stock_quantity: normalizeOpeningStock(formData.stock_quantity) })}
                        className="no-spinner w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-300">Low Stock Alert</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        placeholder="5"
                        value={formData.low_stock_alert}
                        onInput={(e) => normalizeLeadingZerosInput(e, normalizeLowStockAlert)}
                        onChange={(e) => setFormData({ ...formData, low_stock_alert: normalizeLowStockAlert(e.target.value) })}
                        onBlur={() => setFormData({ ...formData, low_stock_alert: normalizeLowStockAlert(formData.low_stock_alert) })}
                        className="no-spinner w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                        required
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-lg transition">
                    SAVE ITEM
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setFormData(defaultForm);
                    }}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 rounded-lg transition"
                  >
                    CANCEL
                  </button>
                </div>
              </form>
            </div>
          )}

          {showEditForm && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-bold mb-4">Edit Item</h2>
              <form onSubmit={handleEditItem} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-300">Category</label>
                      <select
                        value={editData.category}
                        onChange={(e) => {
                          const nextCategory = e.target.value;
                          setEditData((prev) => ({
                            ...prev,
                            category: nextCategory,
                            brand_name: isFoodCategory(nextCategory) ? '' : prev.brand_name,
                          }));
                        }}
                        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                      >
                        {CATEGORY_OPTIONS.map((category) => (
                          <option key={category}>{category}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-300">Item Name</label>
                      <input
                        type="text"
                        placeholder="Kingfisher Strong"
                        value={editData.item_name}
                        onChange={(e) => setEditData({ ...editData, item_name: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                        required
                      />
                    </div>
                    {!isFoodCategory(editData.category) && (
                      <div>
                        <label className="mb-1 block text-sm font-semibold text-slate-300">Brand</label>
                        <input
                          type="text"
                          placeholder="United Breweries"
                          value={editData.brand_name}
                          onChange={(e) => setEditData({ ...editData, brand_name: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                          required
                        />
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    {isFoodCategory(editData.category) ? (
                      <div>
                        <label className="mb-1 block text-sm font-semibold text-slate-300">Portion</label>
                        <select
                          value={editData.portion_type}
                          onChange={(e) =>
                            setEditData({
                              ...editData,
                              portion_type: e.target.value as InventoryFormState['portion_type'],
                            })
                          }
                          className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                          required
                        >
                          {FOOD_PORTION_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="mb-1 block text-sm font-semibold text-slate-300">Volume</label>
                        <select
                          value={editData.volume_ml}
                          onChange={(e) => setEditData({ ...editData, volume_ml: toAllowedVolumeMl(e.target.value) })}
                          className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                          required
                        >
                          {VOLUME_OPTIONS_ML.map((volume) => (
                            <option key={volume} value={volume}>
                              {volume} ml
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-300">Purchase Price (INR)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        inputMode="decimal"
                        placeholder="150"
                        value={editData.purchase_price}
                        onInput={(e) => normalizeLeadingZerosInput(e, normalizeMrpPrice)}
                        onChange={(e) => setEditData({ ...editData, purchase_price: toNonNegativeNumber(e.target.value, 0) })}
                        onBlur={() => setEditData({ ...editData, purchase_price: normalizeMrpPrice(editData.purchase_price) })}
                        className="no-spinner w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-300">Selling Price (INR)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        inputMode="decimal"
                        placeholder="180"
                        value={editData.selling_price}
                        onInput={(e) => normalizeLeadingZerosInput(e, normalizeMrpPrice)}
                        onChange={(e) => setEditData({ ...editData, selling_price: toNonNegativeNumber(e.target.value, 0) })}
                        onBlur={() => setEditData({ ...editData, selling_price: normalizeMrpPrice(editData.selling_price) })}
                        className="no-spinner w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-300">Opening Stock</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        placeholder="20"
                        value={editData.stock_quantity}
                        onInput={(e) => normalizeLeadingZerosInput(e, normalizeOpeningStock)}
                        onChange={(e) => setEditData({ ...editData, stock_quantity: toNonNegativeInt(e.target.value, 0) })}
                        onBlur={() => setEditData({ ...editData, stock_quantity: normalizeOpeningStock(editData.stock_quantity) })}
                        className="no-spinner w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-300">Low Stock Alert</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        placeholder="5"
                        value={editData.low_stock_alert}
                        onInput={(e) => normalizeLeadingZerosInput(e, normalizeLowStockAlert)}
                        onChange={(e) => setEditData({ ...editData, low_stock_alert: normalizeLowStockAlert(e.target.value) })}
                        onBlur={() => setEditData({ ...editData, low_stock_alert: normalizeLowStockAlert(editData.low_stock_alert) })}
                        className="no-spinner w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-400"
                        required
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-lg transition">
                    SAVE CHANGES
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditForm(false);
                      setEditingItemId(null);
                    }}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 rounded-lg transition"
                  >
                    CANCEL
                  </button>
                </div>
              </form>
            </div>
          )}

          {loading ? (
            <p className="text-slate-400">Loading inventory...</p>
          ) : (
            <div className="w-full overflow-x-auto bg-slate-900 border border-slate-800 rounded-lg">
              <table className="inventory-table w-full min-w-[1400px] border-separate border-spacing-0">
                <thead className="bg-slate-800 border-b border-slate-700">
                  <tr>
                    <th className="px-6 py-3 text-left font-bold text-amber-400">Item</th>
                    <th className="px-6 py-3 text-left font-bold text-amber-400">Brand</th>
                    <th className="px-6 py-3 text-left font-bold text-amber-400">Category</th>
                    <th className="px-6 py-3 text-center font-bold text-amber-400">Volume</th>
                    <th className="px-6 py-3 text-center font-bold text-amber-400">Stock</th>
                    <th className="px-6 py-3 text-right font-bold text-amber-400">Purchase</th>
                    <th className="px-6 py-3 text-right font-bold text-amber-400">Selling</th>
                    <th className="px-6 py-3 text-right font-bold text-amber-400">Profit</th>
                    <th className="px-6 py-3 text-right font-bold text-amber-400">Purchase Value</th>
                    <th className="px-6 py-3 text-right font-bold text-amber-400">Selling Value</th>
                    <th className="px-6 py-3 text-center font-bold text-amber-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {filteredInventory.map((item) => {
                    const stockBottles = Number(item.stock_quantity ?? item.quantity ?? 0);
                    const purchasePrice = Number(item.purchase_price ?? item.cost_price ?? 0);
                    const sellingPrice = Number(item.selling_price ?? item.unit_price ?? 0);
                    const profitPerUnit = sellingPrice - purchasePrice;
                    const purchaseValue = stockBottles * purchasePrice;
                    const sellingValue = stockBottles * sellingPrice;
                    return (
                      <tr key={item.id} className="hover:bg-slate-800 transition">
                        <td className="px-6 py-3 font-semibold">{item.item_name}</td>
                        <td className="px-6 py-3 text-slate-300">{item.brand_name ?? '-'}</td>
                        <td className="px-6 py-3 text-slate-300">{item.category}</td>
                        <td className="px-6 py-3 text-center text-slate-300">
                          {isFoodCategory(String(item.category ?? ''))
                            ? foodPortionLabelFromBottleSizeMl(item.bottle_size_ml)
                            : `${toNonNegativeInt(item.bottle_size_ml, 0)} ml`}
                        </td>
                        <td className="px-6 py-3 text-center">{stockBottles}</td>
                        <td className="px-6 py-3 text-right">{inrFormatter.format(purchasePrice)}</td>
                        <td className="px-6 py-3 text-right">{inrFormatter.format(sellingPrice)}</td>
                        <td className="px-6 py-3 text-right font-semibold">{inrFormatter.format(profitPerUnit)}</td>
                        <td className="px-6 py-3 text-right font-semibold text-cyan-300">{inrFormatter.format(purchaseValue)}</td>
                        <td className="px-6 py-3 text-right font-bold text-emerald-300">
                          {inrFormatter.format(sellingValue)}
                        </td>
                        <td className="px-6 py-3 text-center">
                          <div className="flex gap-2 justify-center">
                            <button
                              type="button"
                              onClick={() => openEditModal(item)}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm font-bold"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteItem(item.id)}
                              disabled={role !== 'owner'}
                              className="px-3 py-1 bg-rose-600 hover:bg-rose-500 rounded text-sm font-bold disabled:bg-slate-500 disabled:cursor-not-allowed"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredInventory.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-6 py-8 text-center text-slate-400">
                        No items match your search/filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


