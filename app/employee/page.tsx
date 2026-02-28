'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import StatCard from '@/components/StatCard';
import VoidModal from '@/components/VoidModal';
import AppToast from '@/components/AppToast';
import { authFetch } from '@/lib/auth-fetch';
import { formatError } from '@/lib/errors';
import { useRouteGuard } from '@/lib/route-guard';
import { signOut } from '@/lib/auth';

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  inventoryId: string;
  inventorySizeId: string;
  sizeLabel: string;
  sizeMl: number;
}

interface MenuItem {
  id: string;
  name: string;
  sellingPrice: number;
  bottleSizeMl: number;
  currentStockMl: number;
  stockQuantity: number;
  pegSizeMl: number;
  availablePegs: number;
  category: string;
  sizes: MenuItemSize[];
}

interface MenuItemSize {
  id: string;
  sizeMl: number;
  sizeLabel: string;
  sellingPrice: number;
}

interface RunningTab {
  id: string;
  tab_code: string;
  customer_name: string;
  status: 'open' | 'closed' | 'cancelled';
  total_amount: number;
  table_label?: string | null;
}

type PaymentMethod = 'CASH' | 'CARD' | 'UPI' | 'COMPLIMENTARY';
type SplitMode = 'NONE' | 'BY_ITEM' | 'EQUAL' | 'BY_GUEST';
const DEFAULT_SIZE_ML = 60;
const LIQUOR_CATEGORIES = new Set(['Beer', 'Whisky', 'Rum', 'Vodka', 'Hard Drinks']);
const HARD_DRINK_CATEGORIES = new Set(['Whisky', 'Rum', 'Vodka', 'Gin', 'Brandy', 'Tequila', 'Hard Drinks']);
const POS_CATEGORY_ORDER = ['Beer', 'Hard Drinks', 'Soft Drinks', 'Food'];
// Payment gateway integration intentionally disabled.
// The POS should only record which payment method was used and not process payments.

function isHardDrinkCategory(category: string) {
  const normalized = category.trim().toLowerCase();
  return Array.from(HARD_DRINK_CATEGORIES).some((value) => value.trim().toLowerCase() === normalized);
}

function getAvailableUnits(item: MenuItem, chosenSize: MenuItemSize) {
  if (isHardDrinkCategory(item.category)) {
    return Math.floor(item.currentStockMl / Math.max(chosenSize.sizeMl, 1));
  }
  return Math.max(0, Math.trunc(item.stockQuantity));
}

function buildDefaultSizes(item: any, category: string, fallbackSellingPrice: number): MenuItemSize[] {
  if (fallbackSellingPrice <= 0) return [];

  if (isHardDrinkCategory(category)) {
    const bottleMlRaw = Number(item.bottle_size_ml ?? 750);
    const bottleMl = Number.isFinite(bottleMlRaw) && bottleMlRaw > 0 ? bottleMlRaw : 750;
    return [30, 60, 90].map((sizeMl) => ({
      id: `auto:${String(item.id)}:${sizeMl}`,
      sizeMl,
      sizeLabel: `${sizeMl} ml`,
      sellingPrice: Number(((fallbackSellingPrice * sizeMl) / bottleMl).toFixed(2)),
    }));
  }

  return [
    {
      id: `auto:${String(item.id)}`,
      sizeMl: DEFAULT_SIZE_ML,
      sizeLabel: 'Unit',
      sellingPrice: fallbackSellingPrice,
    },
  ];
}

function toPaise(value: number) {
  return Math.max(0, Math.round(value * 100));
}

function fromPaise(value: number) {
  return Number((value / 100).toFixed(2));
}

function splitEqually(total: number, count: number) {
  const safeCount = Math.max(1, Math.trunc(count));
  const totalPaise = toPaise(total);
  const base = Math.floor(totalPaise / safeCount);
  const remainder = totalPaise % safeCount;
  return Array.from({ length: safeCount }, (_, index) => fromPaise(base + (index < remainder ? 1 : 0)));
}

function splitByWeights(total: number, rawWeights: number[]) {
  const sanitized = rawWeights.map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  const totalWeight = sanitized.reduce((sum, value) => sum + value, 0);
  if (totalWeight <= 0) return splitEqually(total, Math.max(sanitized.length, 1));

  const totalPaise = toPaise(total);
  const preliminary = sanitized.map((weight) => (totalPaise * weight) / totalWeight);
  const base = preliminary.map((value) => Math.floor(value));
  let assigned = base.reduce((sum, value) => sum + value, 0);
  let remainder = totalPaise - assigned;
  const ranking = preliminary
    .map((value, index) => ({ index, fractional: value - Math.floor(value) }))
    .sort((a, b) => b.fractional - a.fractional);

  let rankIndex = 0;
  while (remainder > 0 && ranking.length > 0) {
    const target = ranking[rankIndex % ranking.length];
    base[target.index] += 1;
    assigned += 1;
    remainder = totalPaise - assigned;
    rankIndex += 1;
  }

  return base.map(fromPaise);
}

export default function EmployeePage() {
  const router = useRouter();
  const { isChecking, isAuthorized, role } = useRouteGuard(['staff', 'owner']);
  const inrFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [voidModal, setVoidModal] = useState(false);
  const [selectedItemToVoid, setSelectedItemToVoid] = useState<OrderItem | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sizePickerItem, setSizePickerItem] = useState<MenuItem | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [runningTabs, setRunningTabs] = useState<RunningTab[]>([]);
  const [selectedTabId, setSelectedTabId] = useState('');
  const [newTabCustomer, setNewTabCustomer] = useState('');
  const [splitMode, setSplitMode] = useState<SplitMode>('NONE');
  const [splitGuestCount, setSplitGuestCount] = useState(2);
  const [splitGuestWeights, setSplitGuestWeights] = useState<number[]>([1, 1]);
  const [headerClock, setHeaderClock] = useState(() => new Date());
  const paymentMethodLabel: Record<PaymentMethod, string> = {
    CASH: 'Cash',
    CARD: 'Card',
    UPI: 'UPI',
    COMPLIMENTARY: 'Compl.',
  };

  const fetchMenuItems = useCallback(async () => {
    try {
      const res = await authFetch('/api/inventory');
      const { data } = await res.json();
      if (data) {
        const formattedMenuItems: MenuItem[] = (data as any[]).map((item: any): MenuItem => {
          const resolvedName =
            typeof item.resolved_item_name === 'string' && item.resolved_item_name.trim().length > 0
              ? item.resolved_item_name.trim()
              : item.item_name;
          const normalizedCategory =
            typeof item.resolved_category === 'string' && item.resolved_category.trim().length > 0
              ? item.resolved_category.trim()
              : typeof item.category === 'string' && item.category.trim().length > 0
                ? item.category.trim()
                : 'Uncategorized';
          const isLiquor = LIQUOR_CATEGORIES.has(normalizedCategory);
          const rawSizes = Array.isArray(item.inventory_sizes)
            ? item.inventory_sizes
            : Array.isArray(item.product_sizes)
              ? item.product_sizes
              : [];
          const sizes: MenuItemSize[] = rawSizes
            .map((size: any) => {
              const sizeMl = Number(size.size_ml);
              if (!Number.isFinite(sizeMl) || sizeMl <= 0) return null;
              const sellingPriceRaw =
                Number(size.selling_price) > 0
                  ? Number(size.selling_price)
                  : Number(size.unit_price) > 0
                    ? Number(size.unit_price)
                    : 0;
              return {
                id: String(size.id),
                sizeMl,
                sizeLabel:
                  typeof size.size_label === 'string' && size.size_label.trim().length > 0
                    ? size.size_label.trim()
                    : isLiquor
                      ? `${sizeMl} ml`
                      : 'Unit',
                sellingPrice: sellingPriceRaw,
              };
            })
            .filter((size: MenuItemSize | null): size is MenuItemSize => size !== null)
            .sort((a, b) => a.sizeMl - b.sizeMl);

          const bottleSizeMlRaw = Number(item.resolved_item_volume_ml ?? item.resolved_item_ml ?? item.bottle_size_ml ?? 750);
          const bottleSizeMl = Number.isFinite(bottleSizeMlRaw) && bottleSizeMlRaw > 0 ? bottleSizeMlRaw : 750;
          const fallbackSellingPrice =
            Number(item.selling_price) > 0
              ? Number(item.selling_price)
              : Number(item.sale_price) > 0
                ? Number(item.sale_price)
                : Number(item.unit_price) > 0
                  ? Number(item.unit_price)
                  : 0;
          let effectiveSizes: MenuItemSize[] = [];
          if (isHardDrinkCategory(normalizedCategory)) {
            effectiveSizes = sizes.length > 0 ? sizes : buildDefaultSizes(item, normalizedCategory, fallbackSellingPrice);
          } else {
            const sizeAtBottleMl = sizes.find((size) => Math.round(size.sizeMl) === Math.round(bottleSizeMl));
            const unitPrice =
              (sizeAtBottleMl && sizeAtBottleMl.sellingPrice > 0
                ? sizeAtBottleMl.sellingPrice
                : fallbackSellingPrice) ?? 0;
            effectiveSizes =
              unitPrice > 0
                ? [
                    {
                      id: sizeAtBottleMl?.id ?? `auto:${String(item.id)}:${Math.round(bottleSizeMl)}`,
                      sizeMl: bottleSizeMl,
                      sizeLabel: 'Unit',
                      sellingPrice: unitPrice,
                    },
                  ]
                : [];
          }

          const defaultSize = effectiveSizes.find((size) => size.sellingPrice > 0) ?? effectiveSizes[0];
          const currentStockMl = Number(
            item.current_stock_ml ??
              Number(item.stock_quantity ?? item.quantity ?? 0) * Number(item.bottle_size_ml ?? 750)
          );
          const stockQuantity = Number(item.stock_quantity ?? item.quantity ?? 0);
          const effectiveSellingPrice = defaultSize?.sellingPrice ?? fallbackSellingPrice;
          const defaultSizeMl = defaultSize?.sizeMl ?? DEFAULT_SIZE_ML;
          const availableUnits = isHardDrinkCategory(normalizedCategory)
            ? Math.floor(currentStockMl / Math.max(defaultSizeMl, 1))
            : Math.max(0, Math.trunc(stockQuantity));

          return {
            sellingPrice: effectiveSellingPrice,
            id: String(item.id),
            name: resolvedName,
            bottleSizeMl,
            currentStockMl,
            stockQuantity,
            pegSizeMl: defaultSizeMl,
            availablePegs: availableUnits,
            category: normalizedCategory,
            sizes: effectiveSizes,
          };
        });
        setMenuItems(formattedMenuItems);
        const categorySet = new Set<string>();
        for (const entry of formattedMenuItems) {
          const categoryName = typeof entry.category === 'string' ? entry.category.trim() : '';
          if (categoryName.length > 0) categorySet.add(categoryName);
        }
        const nextCategories = Array.from(categorySet).sort((a, b) => a.localeCompare(b));
        setSelectedCategory((prev) => (prev && nextCategories.includes(prev) ? prev : nextCategories[0] ?? ''));
      }
    } catch (error) {
      console.error('Failed to fetch menu items:', error);
    }
  }, []);

  const fetchRunningTabs = useCallback(async () => {
    try {
      const res = await authFetch('/api/tabs?status=open');
      const payload = await res.json();
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      const mappedRows: RunningTab[] = rows.map((row: any) => ({
        id: String(row.id),
        tab_code: String(row.tab_code ?? ''),
        customer_name: String(row.customer_name ?? 'Walk-in'),
        status: String(row.status ?? 'open') as RunningTab['status'],
        total_amount: Number(row.total_amount ?? 0),
        table_label: typeof row.table_label === 'string' ? row.table_label : null,
      }));
      setRunningTabs(mappedRows);
      if (mappedRows.length === 0) {
        setSelectedTabId('');
      } else if (!mappedRows.some((tab) => tab.id === selectedTabId)) {
        setSelectedTabId(mappedRows[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch running tabs:', error);
    }
  }, [selectedTabId]);

  useEffect(() => {
    if (!isAuthorized) return;
    void fetchMenuItems();
    void fetchRunningTabs();
  }, [fetchMenuItems, fetchRunningTabs, isAuthorized]);

  useEffect(() => {
    const timer = setInterval(() => setHeaderClock(new Date()), 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const safeCount = Math.max(2, Math.min(12, Math.trunc(splitGuestCount)));
    if (safeCount !== splitGuestCount) {
      setSplitGuestCount(safeCount);
      return;
    }
    setSplitGuestWeights((prev) => {
      if (prev.length === safeCount) return prev;
      if (prev.length < safeCount) return [...prev, ...Array.from({ length: safeCount - prev.length }, () => 1)];
      return prev.slice(0, safeCount);
    });
  }, [splitGuestCount]);

  if (isChecking) {
    return <div className="min-h-screen bg-slate-100 text-slate-700 flex items-center justify-center">Checking access...</div>;
  }

  if (!isAuthorized) return null;

  const roleLabel = role ? `${role.charAt(0).toUpperCase()}${role.slice(1)}` : 'Staff';
  const headerDateLabel = headerClock
    .toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
    .replace(',', '')
    .replace('am', 'AM')
    .replace('pm', 'PM');

  const categories = Array.from(
    new Set(
      menuItems
        .map((item) => (typeof item.category === 'string' ? item.category.trim() : ''))
        .filter((category) => category.length > 0)
    )
  ).sort((a, b) => {
    const ai = POS_CATEGORY_ORDER.indexOf(a);
    const bi = POS_CATEGORY_ORDER.indexOf(b);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.localeCompare(b);
  });

  const filteredItems = menuItems.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory.length > 0 && item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const openSizePicker = (item: MenuItem) => {
    const selectableSizes = isHardDrinkCategory(item.category)
      ? item.sizes.filter((size) => [30, 60, 90].includes(size.sizeMl))
      : item.sizes;
    const hasAnySellableSize = selectableSizes.some((size) => size.sellingPrice > 0);
    const hasAnyStock = selectableSizes.some((size) => getAvailableUnits(item, size) > 0);
    if (!hasAnySellableSize) {
      setToast({ type: 'info', message: 'No selling price configured' });
      return;
    }
    if (!hasAnyStock) {
      setToast({ type: 'info', message: 'Out of stock' });
      return;
    }
    setSizePickerItem(item);
  };

  const closeSizePicker = () => {
    setSizePickerItem(null);
  };

  const addToOrder = (item: MenuItem, chosenSize: MenuItemSize) => {
    const chosenPrice = chosenSize.sellingPrice;
    const availableUnits = getAvailableUnits(item, chosenSize);
    if (chosenPrice <= 0) {
      setToast({ type: 'info', message: `${item.name} ${chosenSize.sizeLabel} has no selling price.` });
      return;
    }
    if (availableUnits <= 0) {
      setToast({ type: 'info', message: `${item.name} (${chosenSize.sizeLabel}) is out of stock.` });
      return;
    }
    setOrderItems((prev) => {
      const orderUnitId = `${item.id}:${chosenSize.id}`;
      const existing = prev.find((orderItem) => orderItem.id === orderUnitId);

      if (!existing) {
        return [
          ...prev,
          {
            id: orderUnitId,
            name: `${item.name} (${chosenSize.sizeLabel})`,
            price: chosenPrice,
            quantity: 1,
            inventoryId: item.id,
            inventorySizeId: chosenSize.id,
            sizeLabel: chosenSize.sizeLabel,
            sizeMl: chosenSize.sizeMl,
          },
        ];
      }

      if (existing.quantity >= availableUnits) {
        setToast({ type: 'info', message: `Only ${availableUnits} units available for ${item.name} (${chosenSize.sizeLabel}).` });
        return prev;
      }

      return prev.map((orderItem) =>
        orderItem.id === orderUnitId
          ? { ...orderItem, quantity: orderItem.quantity + 1 }
          : orderItem
      );
    });
    closeSizePicker();
  };

  const removeFromOrder = (id: string) => {
    setOrderItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateQuantity = (id: string, quantity: number) => {
    const selectedOrderItem = orderItems.find((item) => item.id === id);
    const menuItem = menuItems.find((item) => item.id === selectedOrderItem?.inventoryId);
    const size = menuItem?.sizes.find((entry) => entry.id === selectedOrderItem?.inventorySizeId);
    const maxAllowed = menuItem && size ? getAvailableUnits(menuItem, size) : 0;
    if (quantity <= 0) {
      removeFromOrder(id);
    } else if (maxAllowed > 0 && quantity > maxAllowed) {
      setToast({ type: 'info', message: `Only ${maxAllowed} units available.` });
      setOrderItems((prev) => prev.map((item) =>
        item.id === id ? { ...item, quantity: maxAllowed } : item
      ));
    } else {
      setOrderItems((prev) => prev.map((item) =>
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
      const voidedAmount = Number((selectedItemToVoid.price * selectedItemToVoid.quantity).toFixed(2));
      await authFetch('/api/voids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sale_id: 0,
          staff_name: role,
          void_reason: _reason,
          voided_amount: voidedAmount,
        }),
      });
      removeFromOrder(selectedItemToVoid.id);
      setToast({ type: 'success', message: `Voided item: ${selectedItemToVoid.name}` });
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

  const splitPreview = (() => {
    if (splitMode === 'BY_ITEM') {
      return orderItems.map((item, index) => ({
        label: `Item ${index + 1}`,
        detail: item.name,
        amount: Number((item.price * item.quantity).toFixed(2)),
      }));
    }
    if (splitMode === 'EQUAL') {
      const shares = splitEqually(totalPrice, splitGuestCount);
      return shares.map((amount, index) => ({
        label: `Guest ${index + 1}`,
        detail: 'Equal split',
        amount,
      }));
    }
    if (splitMode === 'BY_GUEST') {
      const shares = splitByWeights(totalPrice, splitGuestWeights);
      return shares.map((amount, index) => ({
        label: `Guest ${index + 1}`,
        detail: `Weight ${splitGuestWeights[index] ?? 0}`,
        amount,
      }));
    }
    return [];
  })();

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
      const orderId = `BAR-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Date.now()}`;
      // Do not call any payment gateway. Only record the selected payment method.

      const response = await authFetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          items: orderItems.map((item) => ({
            item_id: item.inventoryId,
            inventory_id: item.inventoryId,
            inventory_size_id: item.inventorySizeId,
            name: item.name,
            quantity: item.quantity,
            unit_price: item.price,
            peg_size_ml: item.sizeMl,
            line_total: Number((item.price * item.quantity).toFixed(2)),
          })),
          total: totalPrice,
          payment_method: paymentMethod,
          paymentMethod: paymentMethod,
          split_bill:
            splitMode === 'NONE'
              ? null
              : {
                  mode: splitMode,
                  entries: splitPreview,
                  total: Number(totalPrice.toFixed(2)),
                },
        }),
      });
      const payload = await response.json();
      const stockUpdates = Number(payload?.stock_updates ?? 0);
      const warningMessage = typeof payload?.warning === 'string' && payload.warning.trim().length > 0 ? payload.warning : '';

      setToast({
        type: warningMessage ? 'info' : 'success',
        message: warningMessage
          ? `Order placed. Total: ${inrFormatter.format(totalPrice)}. ${warningMessage}`
          : `Order placed. Total: ${inrFormatter.format(totalPrice)}. Stock updated for ${stockUpdates} item(s).`,
      });
      setOrderItems([]);
      await fetchMenuItems();
    } catch (error) {
      setToast({ type: 'error', message: `Failed to complete order: ${formatError(error)}` });
    } finally {
      setLoading(false);
    }
  };

  const handleCloseShift = async () => {
    setLoading(true);
    try {
      const tzOffset = new Date().getTimezoneOffset();
      const previewRes = await authFetch(`/api/shift-close?tz_offset=${encodeURIComponent(String(tzOffset))}`);
      const previewPayload = await previewRes.json();
      if (!previewPayload?.success) {
        throw new Error(typeof previewPayload?.error === 'string' ? previewPayload.error : 'Failed to load shift preview');
      }

      const preview = previewPayload.data ?? {};
      const promptMessage =
        `Close shift now?\n\n` +
        `Total Sales: ${inrFormatter.format(Number(preview.totalSales ?? 0))}\n` +
        `Cash Expected: ${inrFormatter.format(Number(preview.cashExpected ?? 0))}\n` +
        `UPI Expected: ${inrFormatter.format(Number(preview.upiExpected ?? 0))}\n` +
        `Card Expected: ${inrFormatter.format(Number(preview.cardExpected ?? 0))}\n\n` +
        `Enter cash counted in drawer:`;
      const cashInput = window.prompt(promptMessage, String(Number(preview.cashExpected ?? 0)));
      if (cashInput === null) {
        setLoading(false);
        return;
      }
      const cashCounted = Number(cashInput);
      if (!Number.isFinite(cashCounted) || cashCounted < 0) {
        throw new Error('Cash counted must be a non-negative number.');
      }

      const closeRes = await authFetch('/api/shift-close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tz_offset: tzOffset,
          cash_counted: cashCounted,
        }),
      });
      const closePayload = await closeRes.json();
      if (!closePayload?.success) {
        throw new Error(typeof closePayload?.error === 'string' ? closePayload.error : 'Failed to close shift');
      }

      const diff = Number(closePayload?.data?.difference ?? 0);
      setToast({
        type: diff === 0 ? 'success' : 'info',
        message: `Shift closed. Difference: ${inrFormatter.format(diff)}.`,
      });
    } catch (error) {
      setToast({ type: 'error', message: `Failed to close shift: ${formatError(error)}` });
    } finally {
      setLoading(false);
    }
  };

  const openRunningTab = async () => {
    if (!newTabCustomer.trim()) {
      setToast({ type: 'info', message: 'Enter customer name to open tab.' });
      return;
    }

    setLoading(true);
    try {
      const res = await authFetch('/api/tabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'open',
          customer_name: newTabCustomer.trim(),
        }),
      });
      const payload = await res.json();
      const createdTabId = payload?.data?.id ? String(payload.data.id) : '';
      if (createdTabId) setSelectedTabId(createdTabId);
      setNewTabCustomer('');
      await fetchRunningTabs();
      setToast({ type: 'success', message: 'Running tab opened.' });
    } catch (error) {
      setToast({ type: 'error', message: `Failed to open tab: ${formatError(error)}` });
    } finally {
      setLoading(false);
    }
  };

  const addCartToSelectedTab = async () => {
    if (!selectedTabId) {
      setToast({ type: 'info', message: 'Select a running tab first.' });
      return;
    }
    if (orderItems.length === 0) {
      setToast({ type: 'info', message: 'Add items to cart before adding to tab.' });
      return;
    }

    setLoading(true);
    try {
      await authFetch('/api/tabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_items',
          tab_id: selectedTabId,
          items: orderItems.map((item) => ({
            name: item.name,
            inventory_id: item.inventoryId,
            inventory_size_id: item.inventorySizeId,
            quantity: item.quantity,
            unit_price: item.price,
            peg_size_ml: item.sizeMl,
            size_label: item.sizeLabel,
            line_total: Number((item.price * item.quantity).toFixed(2)),
          })),
        }),
      });
      setOrderItems([]);
      await fetchRunningTabs();
      setToast({ type: 'success', message: 'Cart added to running tab.' });
    } catch (error) {
      setToast({ type: 'error', message: `Failed to add to tab: ${formatError(error)}` });
    } finally {
      setLoading(false);
    }
  };

  const closeSelectedTab = async () => {
    if (!selectedTabId) {
      setToast({ type: 'info', message: 'Select a running tab first.' });
      return;
    }

    setLoading(true);
    try {
      const res = await authFetch('/api/tabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'close',
          tab_id: selectedTabId,
          payment_method: paymentMethod,
        }),
      });
      const payload = await res.json();
      const totalAmount = Number(payload?.data?.tab?.total_amount ?? 0);
      await fetchMenuItems();
      await fetchRunningTabs();
      setToast({
        type: 'success',
        message: `Tab closed. Total: ${inrFormatter.format(totalAmount)}`,
      });
    } catch (error) {
      setToast({ type: 'error', message: `Failed to close tab: ${formatError(error)}` });
    } finally {
      setLoading(false);
    }
  };

  // Payment processing is intentionally disabled; this POS only records payment method.

  return (
    <div className="layout flex h-screen bg-slate-100 text-slate-900">
      <Sidebar role={role} />
      {toast && <AppToast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      <div className="main-content flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 px-3 lg:px-4 py-2 flex items-center justify-between">
          <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight">BarLogic POS</h1>
          <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-700">
            <span>Staff: {roleLabel}</span>
            <span className="text-slate-400">|</span>
            <span>{headerDateLabel}</span>
            <span className="text-slate-400">|</span>
            <button
              type="button"
              onClick={() => {
                void signOut().finally(() => router.replace('/auth'));
              }}
              className="px-3 py-1 rounded-full bg-slate-900 text-white text-xs font-bold hover:bg-slate-700 transition"
            >
              Logout
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0 p-0">
          <div className="grid h-full grid-cols-1 gap-1 p-1 lg:p-1.5 lg:grid-cols-[minmax(0,7fr)_minmax(360px,3fr)]">
          <div className="min-h-0 flex flex-col bg-white border border-slate-200 rounded-2xl p-2 shadow-sm">
            <div className="mb-1">
              <input
                type="text"
                placeholder="Search menu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-400"
              />
            </div>
            <div className="mb-1 flex gap-2 overflow-x-auto pb-1">
              <span className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                Categories
              </span>
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap ${
                    selectedCategory === category
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto grid grid-cols-2 xl:grid-cols-3 gap-4 pr-2">
              {filteredItems.map((item) => {
                const hasPriceConfigured = item.sizes.some((size) => size.sellingPrice > 0) || item.sellingPrice > 0;
                const hasStockAvailable = item.sizes.some(
                  (size) => Math.floor(item.currentStockMl / Math.max(size.sizeMl, 1)) > 0
                );
                const addDisabled = !hasPriceConfigured || !hasStockAvailable;
                const addLabel = !hasPriceConfigured
                  ? 'No selling price configured'
                  : !hasStockAvailable
                    ? 'Out of stock'
                    : 'Add';
                return (
                  <article
                    key={item.id}
                    className="bg-slate-50 border border-slate-200 p-3 rounded-2xl text-left transition shadow-sm"
                  >
                  <div className="h-12 rounded-xl bg-gradient-to-br from-blue-100 to-slate-200 mb-2 flex items-center justify-center text-slate-700 font-bold text-sm">
                    {item.name.slice(0, 2).toUpperCase()}
                  </div>
                  <p className="font-bold text-base text-slate-900">{item.name}</p>
                  <p className="text-slate-500 text-sm">{item.category}</p>
                  <p className="text-slate-500 text-xs">Bottle: {item.bottleSizeMl} ml</p>
                  {isHardDrinkCategory(item.category) && (
                    <p className="text-slate-500 text-xs">Peg Sizes: 30 ml, 60 ml, 90 ml</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span
                      className={`px-2 py-1 rounded-full text-[11px] font-bold ${
                        hasPriceConfigured
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {hasPriceConfigured ? 'Price set' : 'Price missing'}
                    </span>
                    <span
                      className={`px-2 py-1 rounded-full text-[11px] font-bold ${
                        hasStockAvailable
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {hasStockAvailable ? 'In stock' : 'Stock missing'}
                    </span>
                  </div>
                  <p className="text-blue-700 font-bold mt-2">
                    {hasPriceConfigured
                      ? LIQUOR_CATEGORIES.has(item.category)
                        ? `${inrFormatter.format(item.sellingPrice)}+`
                        : `${inrFormatter.format(item.sellingPrice)} / unit`
                      : 'No selling price configured'}
                  </p>
                  <p className={`text-xs mt-1 ${hasStockAvailable ? 'text-slate-500' : 'text-rose-500'}`}>
                    {hasStockAvailable
                      ? LIQUOR_CATEGORIES.has(item.category)
                        ? `Stock: ${item.stockQuantity} bottles (${item.currentStockMl} ml)`
                        : `Stock: ${item.stockQuantity} units`
                      : 'Out of stock'}
                  </p>
                  <button
                    type="button"
                    onClick={() => openSizePicker(item)}
                    disabled={addDisabled}
                    className="mt-4 w-full rounded-xl bg-blue-600 text-white font-semibold py-2 hover:bg-blue-500 disabled:bg-slate-300 disabled:text-slate-600"
                  >
                    {addLabel}
                  </button>
                  </article>
                );
              })}
              {!loading && filteredItems.length === 0 && (
                <p className="col-span-2 text-slate-500 text-center py-8">
                  {searchQuery || selectedCategory.length > 0
                    ? 'No menu items match your filters.'
                    : 'Select a category to view items.'}
                </p>
              )}
            </div>
          </div>

          <div className="min-h-0 lg:sticky lg:top-0 flex flex-col bg-white border border-slate-200 rounded-2xl p-4 lg:p-5 shadow-sm overflow-y-auto">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Cart</h2>
              <span className="px-2.5 py-1 rounded-full bg-blue-50 border border-blue-100 text-xs font-bold text-blue-700">
                {totalItems} items
              </span>
            </div>

            <div className="mb-4 pr-1">
              {orderItems.length === 0 ? (
                <p className="text-slate-500 text-center py-8">No items added</p>
              ) : (
                <div className="space-y-3">
                  {orderItems.map(item => (
                    <div
                      key={item.id}
                      className="bg-slate-50 border border-slate-200 p-3 rounded-xl group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{item.name}</p>
                          <p className="text-slate-500 text-xs">{inrFormatter.format(item.price)} each</p>
                        </div>
                        <button
                          onClick={() => openVoidModal(item)}
                          className="px-2 py-1 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded text-xs font-bold opacity-0 group-hover:opacity-100 transition shrink-0"
                          title="Void this item"
                        >
                          Void
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
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
                        <p className="font-bold text-blue-700">{inrFormatter.format(item.price * item.quantity)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <StatCard label="Items" value={totalItems.toString()} />
              <StatCard label="Total" value={inrFormatter.format(totalPrice)} />
            </div>

            <div className="border-t border-slate-200 pt-4 flex flex-col gap-3">
              <div className="space-y-3">
              <section className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Running Tab</p>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-500">Open new tab</label>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                    <input
                      type="text"
                      value={newTabCustomer}
                      onChange={(e) => setNewTabCustomer(e.target.value)}
                      placeholder="Customer name"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:border-blue-400"
                    />
                    <button
                      type="button"
                      onClick={() => void openRunningTab()}
                      disabled={loading}
                      className="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-700 disabled:bg-slate-300 disabled:text-slate-600"
                    >
                      Open
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-500">Update running tab</label>
                  <select
                    value={selectedTabId}
                    onChange={(e) => setSelectedTabId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:border-blue-400"
                  >
                    <option value="">Select running tab</option>
                    {runningTabs.map((tab) => (
                      <option key={tab.id} value={tab.id}>
                        {tab.customer_name} {tab.table_label ? `(${tab.table_label})` : ''} - {inrFormatter.format(tab.total_amount)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void addCartToSelectedTab()}
                    disabled={loading || !selectedTabId || orderItems.length === 0}
                    className="py-2 px-2 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    Add Cart to Tab
                  </button>
                  <button
                    type="button"
                    onClick={() => void closeSelectedTab()}
                    disabled={loading || !selectedTabId}
                    className="py-2 px-2 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-500 disabled:bg-slate-300 disabled:text-slate-600"
                  >
                    Close Selected Tab
                  </button>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-2">Split Bill</p>
                <select
                  value={splitMode}
                  onChange={(e) => setSplitMode(e.target.value as SplitMode)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:border-blue-400"
                >
                  <option value="NONE">No split</option>
                  <option value="BY_ITEM">Split by item</option>
                  <option value="EQUAL">Split equally</option>
                  <option value="BY_GUEST">Split by guest</option>
                </select>

                {(splitMode === 'EQUAL' || splitMode === 'BY_GUEST') && (
                  <div className="mt-2">
                    <label className="text-xs text-slate-500 font-semibold">Guest Count</label>
                    <input
                      type="number"
                      min={2}
                      max={12}
                      value={splitGuestCount}
                      onChange={(e) => setSplitGuestCount(Number(e.target.value))}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:border-blue-400"
                    />
                  </div>
                )}

                {splitMode === 'BY_GUEST' && (
                  <div className="mt-2 space-y-2 max-h-32 overflow-y-auto pr-1">
                    {splitGuestWeights.map((weight, index) => (
                      <div key={`weight-${index}`} className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-600">Guest {index + 1} weight</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={weight}
                          onChange={(e) => {
                            const next = Number(e.target.value);
                            setSplitGuestWeights((prev) =>
                              prev.map((entry, entryIndex) =>
                                entryIndex === index ? (Number.isFinite(next) && next >= 0 ? next : 0) : entry
                              )
                            );
                          }}
                          className="w-24 px-2 py-1 rounded border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:border-blue-400"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {splitMode !== 'NONE' && (
                  <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2 max-h-32 overflow-y-auto">
                    {splitPreview.length === 0 ? (
                      <p className="text-xs text-slate-500">Add items to preview split.</p>
                    ) : (
                      <div className="space-y-1">
                        {splitPreview.map((entry, index) => (
                          <div key={`${entry.label}-${index}`} className="flex items-center justify-between text-xs">
                            <div className="min-w-0 pr-2">
                              <p className="font-semibold text-slate-700">{entry.label}</p>
                              <p className="text-slate-500 truncate">{entry.detail}</p>
                            </div>
                            <p className="font-bold text-slate-800">{inrFormatter.format(entry.amount)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-2">Payment Method</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['CASH', 'CARD', 'UPI', 'COMPLIMENTARY'] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`py-2 px-2 rounded-lg text-xs font-bold border transition whitespace-nowrap ${
                        paymentMethod === method
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {paymentMethodLabel[method]}
                    </button>
                  ))}
                </div>
              </section>
              </div>

              <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 space-y-2 shrink-0">
                <p className="text-[11px] uppercase tracking-wide text-blue-700 font-semibold">Checkout Actions</p>
                <button
                  onClick={completeOrder}
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 text-white disabled:text-slate-600 font-bold py-3 rounded-xl transition shadow-sm"
                >
                  {loading ? 'Processing...' : 'Complete Order'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCloseShift()}
                  disabled={loading}
                  className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-slate-300 text-white disabled:text-slate-600 font-bold py-3 rounded-xl transition"
                >
                  {loading ? 'Processing...' : 'Close Shift'}
                </button>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
              </section>
            </div>
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
      {sizePickerItem && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-sm text-slate-500">{sizePickerItem.category}</p>
                <h3 className="text-xl font-bold text-slate-900">{sizePickerItem.name}</h3>
              </div>
              <button
                type="button"
                onClick={closeSizePicker}
                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold"
              >
                Close
              </button>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {(isHardDrinkCategory(sizePickerItem.category)
                ? sizePickerItem.sizes.filter((size) => [30, 60, 90].includes(size.sizeMl))
                : sizePickerItem.sizes
              ).map((size) => {
                const sizeUnits = getAvailableUnits(sizePickerItem, size);
                const isDisabled = sizeUnits <= 0 || size.sellingPrice <= 0;
                return (
                  <div
                    key={size.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{size.sizeLabel}</p>
                      <p className="text-sm text-slate-500">
                        {size.sellingPrice > 0 ? inrFormatter.format(size.sellingPrice) : 'No price'} • {sizeUnits} available
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => addToOrder(sizePickerItem, size)}
                      disabled={isDisabled}
                      className="rounded-lg bg-blue-600 text-white text-xs font-semibold py-2 px-3 hover:bg-blue-500 disabled:bg-slate-300 disabled:text-slate-600"
                    >
                      Add
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



