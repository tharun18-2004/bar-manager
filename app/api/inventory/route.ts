import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { badRequest, serverError } from '@/lib/api-response';
import { writeAuditEvent } from '@/lib/audit-log';

const CATEGORY_ALIAS: Record<string, string> = {
  beer: 'Beer',
  'hard drinks': 'Hard Drinks',
  whisky: 'Hard Drinks',
  whiskey: 'Hard Drinks',
  rum: 'Hard Drinks',
  vodka: 'Hard Drinks',
  brandy: 'Hard Drinks',
  gin: 'Hard Drinks',
  tequila: 'Hard Drinks',
  'soft drinks': 'Soft Drinks',
  softdrink: 'Soft Drinks',
  juice: 'Soft Drinks',
  water: 'Soft Drinks',
  food: 'Food',
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return String(error ?? '');
}

function isRelationMissingError(error: unknown, relation: string) {
  const message = getErrorMessage(error);
  return message.includes(relation) && message.includes('does not exist');
}

function isSchemaCacheMissingColumn(error: unknown, table: string, column: string) {
  const message = getErrorMessage(error);
  return (
    message.includes(`Could not find the '${column}' column of '${table}' in the schema cache`) ||
    (message.includes(table) && message.includes(column) && message.includes('schema cache'))
  );
}

function lowStockAlertColumnMissingResponse() {
  return NextResponse.json(
    {
      success: false,
      error:
        "Database column inventory.low_stock_alert is missing. Run db/migrations/2026-02-27_add_low_stock_alert_to_inventory.sql.",
    },
    { status: 500 }
  );
}

function purchasePriceColumnMissingResponse() {
  return NextResponse.json(
    {
      success: false,
      error:
        "Database column inventory.purchase_price is missing. Run db/migrations/2026-02-28_add_inventory_profit_and_expenses.sql.",
    },
    { status: 500 }
  );
}

function normalizeItemName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeCategoryName(value: string) {
  const raw = value.trim().replace(/\s+/g, ' ');
  if (!raw) return raw;
  const alias = CATEGORY_ALIAS[raw.toLowerCase()];
  if (alias) return alias;
  return raw;
}

function isFoodCategory(value: unknown) {
  if (typeof value !== 'string') return false;
  return normalizeCategoryName(value).toLowerCase() === 'food';
}

function toNormalizedMl(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  const hasDecimal = !Number.isInteger(parsed);
  if (hasDecimal && parsed <= 5) {
    return Math.max(0, Math.round(parsed * 1000));
  }
  return Math.max(0, Math.round(parsed));
}

function toRupeeInt(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return NaN;
  return Math.max(0, Math.round(parsed));
}

async function findDuplicateItem(itemName: string, excludeId?: string | number) {
  const normalizedName = normalizeItemName(itemName);
  const { data, error } = await supabase
    .from('inventory')
    .select('id, item_name')
    .ilike('item_name', normalizedName)
    .limit(5);
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  const duplicate = rows.find((row) => {
    const rowId = row?.id;
    if (excludeId !== undefined && excludeId !== null && String(rowId) === String(excludeId)) return false;
    return normalizeItemName(String(row?.item_name ?? '')).toLowerCase() === normalizedName.toLowerCase();
  });
  return duplicate ?? null;
}

async function ensureCatalogRefs(
  itemName: string,
  category: string,
  options?: { volume_ml?: number; price?: number; stock?: number }
) {
  try {
    const normalizedItemName = normalizeItemName(itemName);
    const normalizedCategory = normalizeCategoryName(category);

    const { data: categoryRows, error: categoryQueryError } = await supabase
      .from('categories')
      .select('id')
      .eq('name', normalizedCategory)
      .limit(1);
    if (categoryQueryError) {
      if (isRelationMissingError(categoryQueryError, 'categories')) return { categoryId: null, itemId: null };
      throw categoryQueryError;
    }

    let categoryId = categoryRows?.[0]?.id ?? null;
    if (!categoryId) {
      const { data: insertedCategory, error: categoryInsertError } = await supabase
        .from('categories')
        .insert([{ name: normalizedCategory }])
        .select('id')
        .single();
      if (categoryInsertError) throw categoryInsertError;
      categoryId = insertedCategory?.id ?? null;
    }

    if (!categoryId) return { categoryId: null, itemId: null };

    const { data: itemRows, error: itemQueryError } = await supabase
      .from('items')
      .select('id')
      .eq('name', normalizedItemName)
      .eq('category_id', categoryId)
      .limit(1);
    if (itemQueryError) {
      if (isRelationMissingError(itemQueryError, 'items')) return { categoryId, itemId: null };
      throw itemQueryError;
    }

    let itemId = itemRows?.[0]?.id ?? null;
    if (!itemId) {
      const { data: insertedItem, error: itemInsertError } = await supabase
        .from('items')
        .insert([
          {
            name: normalizedItemName,
            category_id: categoryId,
            volume_ml: toNormalizedMl(options?.volume_ml),
            price: Number.isFinite(Number(options?.price)) ? Number(options?.price) : 0,
            stock: Number.isFinite(Number(options?.stock)) ? Number(options?.stock) : 0,
          },
        ])
        .select('id')
        .single();
      if (itemInsertError) throw itemInsertError;
      itemId = insertedItem?.id ?? null;
    } else if (
      options &&
      (Number.isFinite(Number(options.volume_ml)) || Number.isFinite(Number(options.price)) || Number.isFinite(Number(options.stock)))
    ) {
      const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (Number.isFinite(Number(options.volume_ml))) {
        const normalizedMl = toNormalizedMl(options.volume_ml);
        updatePayload.volume_ml = normalizedMl;
      }
      if (Number.isFinite(Number(options.price))) updatePayload.price = Number(options.price);
      if (Number.isFinite(Number(options.stock))) updatePayload.stock = Number(options.stock);
      const { error: itemUpdateError } = await supabase.from('items').update(updatePayload).eq('id', itemId);
      if (itemUpdateError && !isRelationMissingError(itemUpdateError, 'items')) throw itemUpdateError;
    }

    return { categoryId, itemId };
  } catch (error) {
    if (isRelationMissingError(error, 'categories') || isRelationMissingError(error, 'items')) {
      return { categoryId: null, itemId: null };
    }
    throw error;
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['staff', 'owner']);
    if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabase
      .from('inventory')
      .select('*, inventory_sizes(*)')
      .order('category', { ascending: true });

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    const itemIds = rows.map((row) => String(row?.item_id ?? '')).filter((id) => id.length > 0);
    const categoryIds = rows.map((row) => String(row?.category_id ?? '')).filter((id) => id.length > 0);

    const itemMap = new Map<string, any>();
    const categoryMap = new Map<string, string>();

    if (itemIds.length > 0) {
      const { data: itemRows, error: itemError } = await supabase
        .from('items')
        .select('id, name, category_id, volume_ml')
        .in('id', itemIds);
      if (!itemError && Array.isArray(itemRows)) {
        for (const itemRow of itemRows) {
          itemMap.set(String(itemRow.id), itemRow);
          if (itemRow?.category_id) categoryIds.push(String(itemRow.category_id));
        }
      }
    }

    const uniqueCategoryIds = Array.from(new Set(categoryIds));
    if (uniqueCategoryIds.length > 0) {
      const { data: categoryRows, error: categoryError } = await supabase
        .from('categories')
        .select('id, name')
        .in('id', uniqueCategoryIds);
      if (!categoryError && Array.isArray(categoryRows)) {
        for (const categoryRow of categoryRows) {
          categoryMap.set(String(categoryRow.id), String(categoryRow.name ?? ''));
        }
      }
    }

    const enrichedRows = rows.map((row) => {
      const linkedItem = itemMap.get(String(row?.item_id ?? ''));
      const linkedCategoryName =
        (linkedItem?.category_id ? categoryMap.get(String(linkedItem.category_id)) : null) ??
        (row?.category_id ? categoryMap.get(String(row.category_id)) : null) ??
        null;

      return {
        ...row,
        resolved_item_name: linkedItem?.name ?? row?.item_name ?? row?.name ?? '',
        resolved_category: normalizeCategoryName(linkedCategoryName ?? row?.category ?? ''),
        resolved_item_volume_ml: toNormalizedMl(linkedItem?.volume_ml ?? linkedItem?.ml ?? row?.bottle_size_ml ?? 0),
        resolved_item_ml: toNormalizedMl(linkedItem?.volume_ml ?? linkedItem?.ml ?? row?.bottle_size_ml ?? 0),
      };
    });

    return NextResponse.json({ success: true, data: enrichedRows });
  } catch (error) {
    return serverError(error, req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['owner']);
    if (auth instanceof NextResponse) return auth;

    const {
      item_name,
      brand_name,
      category,
      bottle_size_ml,
      cost_price,
      purchase_price,
      selling_price,
      stock_quantity,
      low_stock_alert,
      current_stock_ml,
      quantity,
      unit_price,
    } = await req.json();
    const parsedBottleSizeMl = toNormalizedMl(bottle_size_ml);
    const parsedPurchasePriceRaw = toRupeeInt(purchase_price ?? cost_price);
    const parsedCostPriceRaw = toRupeeInt(cost_price ?? purchase_price);
    const parsedPurchasePrice = Number.isFinite(parsedPurchasePriceRaw) ? parsedPurchasePriceRaw : 0;
    const parsedCostPrice = Number.isFinite(parsedCostPriceRaw) ? parsedCostPriceRaw : 0;
    const parsedSellingPrice = toRupeeInt(selling_price ?? unit_price);
    const parsedStockQuantity = Number(stock_quantity ?? quantity);
    const parsedLowStockAlert = Number(low_stock_alert ?? 5);
    const parsedCurrentStockMlRaw =
      current_stock_ml === undefined || current_stock_ml === null ? null : Number(current_stock_ml);

    if (!item_name || typeof item_name !== 'string' || item_name.trim().length === 0) {
      return badRequest('item_name is required');
    }
    if (!category || typeof category !== 'string' || category.trim().length === 0) {
      return badRequest('category is required');
    }
    if (category.trim().length === 0) {
      return badRequest('category is required');
    }
    const normalizedCategory = normalizeCategoryName(category.trim());
    const foodCategory = isFoodCategory(normalizedCategory);
    if (!foodCategory && (!brand_name || typeof brand_name !== 'string' || brand_name.trim().length === 0)) {
      return badRequest('brand_name is required');
    }
    if (!Number.isFinite(parsedBottleSizeMl) || parsedBottleSizeMl <= 0) {
      return badRequest('bottle_size_ml must be a positive number');
    }
    if (!Number.isFinite(parsedPurchasePrice) || parsedPurchasePrice < 0) {
      return badRequest('purchase_price must be a non-negative number');
    }
    if (!Number.isFinite(parsedSellingPrice) || parsedSellingPrice < 0) {
      return badRequest('selling_price must be a non-negative integer (INR)');
    }
    if (!Number.isFinite(parsedStockQuantity) || parsedStockQuantity < 0) {
      return badRequest('stock_quantity must be a non-negative number');
    }
    if (!Number.isInteger(parsedLowStockAlert) || parsedLowStockAlert < 0) {
      return badRequest('low_stock_alert must be a non-negative integer');
    }
    if (
      parsedCurrentStockMlRaw !== null &&
      (!Number.isFinite(parsedCurrentStockMlRaw) || parsedCurrentStockMlRaw < 0)
    ) {
      return badRequest('current_stock_ml must be a non-negative number');
    }
    const normalizedItemName = normalizeItemName(item_name);
    const duplicateItem = await findDuplicateItem(normalizedItemName);
    if (duplicateItem) {
      return badRequest('Item already exists');
    }

    const parsedCurrentStockMl =
      parsedCurrentStockMlRaw === null ? parsedStockQuantity * parsedBottleSizeMl : parsedCurrentStockMlRaw;
    const catalogRefs = await ensureCatalogRefs(normalizedItemName, normalizedCategory, {
      volume_ml: parsedBottleSizeMl,
      price: parsedSellingPrice,
      stock: parsedStockQuantity,
    });

    const createPayload: Record<string, unknown> = {
      item_name: normalizedItemName,
      name: normalizedItemName,
      brand_name: foodCategory ? '' : String(brand_name ?? '').trim(),
      category: normalizedCategory,
      category_id: catalogRefs.categoryId,
      item_id: catalogRefs.itemId,
      bottle_size_ml: parsedBottleSizeMl,
      purchase_price: parsedPurchasePrice,
      cost_price: parsedCostPrice,
      selling_price: parsedSellingPrice,
      profit: parsedSellingPrice - parsedPurchasePrice,
      sale_price: parsedSellingPrice,
      stock_quantity: parsedStockQuantity,
      low_stock_alert: parsedLowStockAlert,
      current_stock_ml: parsedCurrentStockMl,
      // Legacy columns kept in sync.
      quantity: parsedStockQuantity,
      unit_price: parsedSellingPrice,
    };

    let insertResult = await supabase.from('inventory').insert([createPayload]).select();
    if (insertResult.error && isSchemaCacheMissingColumn(insertResult.error, 'inventory', 'profit')) {
      const fallbackPayload = { ...createPayload };
      delete fallbackPayload.profit;
      insertResult = await supabase.from('inventory').insert([fallbackPayload]).select();
    }
    if (insertResult.error && isSchemaCacheMissingColumn(insertResult.error, 'inventory', 'purchase_price')) {
      const fallbackPayload = { ...createPayload };
      delete fallbackPayload.purchase_price;
      insertResult = await supabase.from('inventory').insert([fallbackPayload]).select();
    }
    if (insertResult.error && isSchemaCacheMissingColumn(insertResult.error, 'inventory', 'profit')) {
      const fallbackPayload = { ...createPayload };
      delete fallbackPayload.purchase_price;
      delete fallbackPayload.profit;
      insertResult = await supabase.from('inventory').insert([fallbackPayload]).select();
    }
    if (insertResult.error && isSchemaCacheMissingColumn(insertResult.error, 'inventory', 'low_stock_alert')) {
      return lowStockAlertColumnMissingResponse();
    }
    if (insertResult.error && isSchemaCacheMissingColumn(insertResult.error, 'inventory', 'purchase_price')) {
      return purchasePriceColumnMissingResponse();
    }

    if (insertResult.error) throw insertResult.error;
    const data = insertResult.data;
    const createdItem = data?.[0] ?? null;

    if (createdItem?.id) {
      const { error: sizeError } = await supabase
        .from('inventory_sizes')
        .upsert(
          [
            {
              inventory_id: createdItem.id,
              size_label: 'Peg 60 ml',
              size_ml: 60,
              selling_price: parsedSellingPrice,
              is_active: true,
            },
          ],
          { onConflict: 'inventory_id,size_ml' }
        );
      if (sizeError) throw sizeError;
    }

    await writeAuditEvent({
      req,
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      actorRole: auth.role,
      action: 'inventory.create',
      resource: 'inventory',
      resourceId: createdItem?.id ?? null,
      outcome: 'success',
      after: createdItem,
      metadata: {
        item_name: createdItem?.item_name ?? item_name.trim(),
      },
    });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return serverError(error, req);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['owner']);
    if (auth instanceof NextResponse) return auth;

    const {
      id,
      quantity,
      stock_quantity,
      current_stock_ml,
      cost_price,
      purchase_price,
      selling_price,
      bottle_size_ml,
      low_stock_alert,
      category,
      brand_name,
      item_name,
    } = await req.json();
    const normalizedId =
      typeof id === 'number'
        ? id
        : typeof id === 'string'
          ? id.trim()
          : '';
    const parsedNumericId =
      typeof normalizedId === 'number' ? normalizedId : Number(normalizedId);
    const hasQuantityUpdate = quantity !== undefined || stock_quantity !== undefined;
    const parsedStockQuantity = Number(stock_quantity ?? quantity);
    const hasCurrentStockMl = current_stock_ml !== undefined;
    const parsedCurrentStockMl = Number(current_stock_ml);
    const hasCostPrice = cost_price !== undefined;
    const parsedCostPrice = toRupeeInt(cost_price);
    const hasPurchasePrice = purchase_price !== undefined;
    const parsedPurchasePrice = toRupeeInt(purchase_price);
    const hasSellingPrice = selling_price !== undefined;
    const parsedSellingPrice = toRupeeInt(selling_price);
    const hasBottleSizeMl = bottle_size_ml !== undefined;
    const parsedBottleSizeMl = toNormalizedMl(bottle_size_ml);
    const hasLowStockAlert = low_stock_alert !== undefined;
    const parsedLowStockAlert = Number(low_stock_alert);

    if (
      (typeof normalizedId === 'number' && (!Number.isInteger(normalizedId) || normalizedId <= 0)) ||
      (typeof normalizedId === 'string' && normalizedId.length === 0)
    ) {
      return badRequest('id is required');
    }
    if (hasQuantityUpdate && (!Number.isFinite(parsedStockQuantity) || parsedStockQuantity < 0)) {
      return badRequest('stock_quantity must be a non-negative number');
    }
    if (hasCurrentStockMl && (!Number.isFinite(parsedCurrentStockMl) || parsedCurrentStockMl < 0)) {
      return badRequest('current_stock_ml must be a non-negative number');
    }
    if (hasCostPrice && (!Number.isFinite(parsedCostPrice) || parsedCostPrice < 0)) {
      return badRequest('cost_price must be a non-negative integer (INR)');
    }
    if (hasPurchasePrice && (!Number.isFinite(parsedPurchasePrice) || parsedPurchasePrice < 0)) {
      return badRequest('purchase_price must be a non-negative integer (INR)');
    }
    if (hasSellingPrice && (!Number.isFinite(parsedSellingPrice) || parsedSellingPrice < 0)) {
      return badRequest('selling_price must be a non-negative integer (INR)');
    }
    if (hasBottleSizeMl && (!Number.isFinite(parsedBottleSizeMl) || parsedBottleSizeMl <= 0)) {
      return badRequest('bottle_size_ml must be a positive number');
    }
    if (hasLowStockAlert && (!Number.isInteger(parsedLowStockAlert) || parsedLowStockAlert < 0)) {
      return badRequest('low_stock_alert must be a non-negative integer');
    }
    if (category !== undefined && (typeof category !== 'string' || category.trim().length === 0)) {
      return badRequest('category must be a non-empty string');
    }
    if (item_name !== undefined && (typeof item_name !== 'string' || item_name.trim().length === 0)) {
      return badRequest('item_name must be a non-empty string');
    }

    const targetId =
      Number.isInteger(parsedNumericId) && parsedNumericId > 0
        ? parsedNumericId
        : String(normalizedId);

    const { data: beforeRows, error: beforeError } = await supabase
      .from('inventory')
      .select('*')
      .eq('id', targetId)
      .limit(1);
    if (beforeError) throw beforeError;
    const beforeRecord = beforeRows?.[0] ?? null;
    const baselineBottleSizeMl = Number(beforeRecord?.bottle_size_ml ?? 750);
    const normalizedUpdatedItemName = item_name !== undefined ? normalizeItemName(item_name) : null;
    const resolvedCategoryForValidation = normalizeCategoryName(
      category !== undefined ? String(category) : String(beforeRecord?.category ?? '')
    );
    const foodCategory = isFoodCategory(resolvedCategoryForValidation);
    if (
      brand_name !== undefined &&
      !foodCategory &&
      (typeof brand_name !== 'string' || brand_name.trim().length === 0)
    ) {
      return badRequest('brand_name must be a non-empty string');
    }

    if (normalizedUpdatedItemName) {
      const duplicateItem = await findDuplicateItem(normalizedUpdatedItemName, targetId);
      if (duplicateItem) {
        return badRequest('Item already exists');
      }
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };
    const updatedFields: string[] = [];

    if (hasQuantityUpdate) {
      updateData.stock_quantity = parsedStockQuantity;
      updateData.quantity = parsedStockQuantity;
      updatedFields.push('stock_quantity', 'quantity');
    }

    if (hasCurrentStockMl) {
      updateData.current_stock_ml = parsedCurrentStockMl;
      updatedFields.push('current_stock_ml');
    } else if (hasQuantityUpdate && Number.isFinite(baselineBottleSizeMl) && baselineBottleSizeMl > 0) {
      updateData.current_stock_ml = parsedStockQuantity * baselineBottleSizeMl;
      updatedFields.push('current_stock_ml');
    }

    const effectivePurchasePrice = hasPurchasePrice
      ? parsedPurchasePrice
      : hasCostPrice
        ? parsedCostPrice
        : Number(beforeRecord?.purchase_price ?? beforeRecord?.cost_price ?? 0);

    if (hasPurchasePrice) {
      updateData.purchase_price = parsedPurchasePrice;
      updateData.cost_price = parsedPurchasePrice;
      updatedFields.push('purchase_price', 'cost_price');
    } else if (hasCostPrice) {
      updateData.purchase_price = parsedCostPrice;
      updateData.cost_price = parsedCostPrice;
      updatedFields.push('purchase_price', 'cost_price');
    }
    if (hasSellingPrice) {
      updateData.selling_price = parsedSellingPrice;
      updateData.profit = parsedSellingPrice - effectivePurchasePrice;
      updateData.sale_price = parsedSellingPrice;
      updateData.unit_price = parsedSellingPrice;
      updatedFields.push('selling_price', 'profit', 'sale_price', 'unit_price');
    } else if (hasPurchasePrice || hasCostPrice) {
      const existingSellingPrice = Number(beforeRecord?.selling_price ?? beforeRecord?.unit_price ?? 0);
      updateData.profit = existingSellingPrice - effectivePurchasePrice;
      updatedFields.push('profit');
    }
    if (hasBottleSizeMl) {
      updateData.bottle_size_ml = parsedBottleSizeMl;
      updatedFields.push('bottle_size_ml');
    }
    if (hasLowStockAlert) {
      updateData.low_stock_alert = parsedLowStockAlert;
      updatedFields.push('low_stock_alert');
    }
    if (category !== undefined) {
      updateData.category = category.trim();
      updatedFields.push('category');
    }
    if (brand_name !== undefined) {
      updateData.brand_name = foodCategory ? '' : brand_name.trim();
      updatedFields.push('brand_name');
    } else if (foodCategory) {
      updateData.brand_name = '';
      updatedFields.push('brand_name');
    }
    if (normalizedUpdatedItemName) {
      updateData.item_name = normalizedUpdatedItemName;
      updateData.name = normalizedUpdatedItemName;
      updatedFields.push('item_name', 'name');
    }
    if (normalizedUpdatedItemName || category !== undefined) {
      const resolvedCategory = normalizeCategoryName(
        category !== undefined ? category.trim() : String(beforeRecord?.category ?? '').trim()
      );
      const resolvedItemName = normalizedUpdatedItemName ?? String(beforeRecord?.item_name ?? '').trim();
      if (resolvedCategory && resolvedItemName) {
        const effectiveBottleMl = hasBottleSizeMl
          ? parsedBottleSizeMl
          : Number(beforeRecord?.bottle_size_ml ?? 0);
        const effectiveSellingPrice = hasSellingPrice
          ? parsedSellingPrice
          : Number(beforeRecord?.selling_price ?? beforeRecord?.unit_price ?? 0);
        const effectiveStock = hasQuantityUpdate
          ? parsedStockQuantity
          : Number(beforeRecord?.stock_quantity ?? beforeRecord?.quantity ?? 0);
        const catalogRefs = await ensureCatalogRefs(resolvedItemName, resolvedCategory, {
          volume_ml: effectiveBottleMl,
          price: effectiveSellingPrice,
          stock: effectiveStock,
        });
        if (catalogRefs.categoryId) {
          updateData.category_id = catalogRefs.categoryId;
          updatedFields.push('category_id');
        }
        if (catalogRefs.itemId) {
          updateData.item_id = catalogRefs.itemId;
          updatedFields.push('item_id');
        }
      }
    }

    let updateResult = await supabase
      .from('inventory')
      .update(updateData)
      .eq('id', targetId)
      .select();

    if (updateResult.error && isSchemaCacheMissingColumn(updateResult.error, 'inventory', 'profit')) {
      const fallbackUpdateData = { ...updateData };
      delete fallbackUpdateData.profit;
      updateResult = await supabase
        .from('inventory')
        .update(fallbackUpdateData)
        .eq('id', targetId)
        .select();
    }
    if (updateResult.error && isSchemaCacheMissingColumn(updateResult.error, 'inventory', 'purchase_price')) {
      const fallbackUpdateData = { ...updateData };
      delete fallbackUpdateData.purchase_price;
      updateResult = await supabase
        .from('inventory')
        .update(fallbackUpdateData)
        .eq('id', targetId)
        .select();
    }
    if (updateResult.error && isSchemaCacheMissingColumn(updateResult.error, 'inventory', 'profit')) {
      const fallbackUpdateData = { ...updateData };
      delete fallbackUpdateData.purchase_price;
      delete fallbackUpdateData.profit;
      updateResult = await supabase
        .from('inventory')
        .update(fallbackUpdateData)
        .eq('id', targetId)
        .select();
    }

    if (updateResult.error && hasLowStockAlert && isSchemaCacheMissingColumn(updateResult.error, 'inventory', 'low_stock_alert')) {
      return lowStockAlertColumnMissingResponse();
    }
    if (updateResult.error && (hasPurchasePrice || hasCostPrice) && isSchemaCacheMissingColumn(updateResult.error, 'inventory', 'purchase_price')) {
      return purchasePriceColumnMissingResponse();
    }

    if (updateResult.error) throw updateResult.error;
    const data = updateResult.data;

    await writeAuditEvent({
      req,
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      actorRole: auth.role,
      action: 'inventory.update',
      resource: 'inventory',
      resourceId: targetId,
      outcome: 'success',
      before: beforeRecord,
      after: data?.[0] ?? null,
      metadata: {
        updatedFields,
      },
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return serverError(error, req);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['owner']);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id || id.trim().length === 0) {
      return badRequest('id is required');
    }

    const normalizedId = id.trim();
    const { data: beforeRows, error: beforeError } = await supabase
      .from('inventory')
      .select('*')
      .eq('id', normalizedId)
      .limit(1);
    if (beforeError) throw beforeError;
    const beforeRecord = beforeRows?.[0] ?? null;
    if (!beforeRecord) return badRequest('inventory item not found');

    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('id', normalizedId);

    if (error) {
      const message = getErrorMessage(error).toLowerCase();
      if (message.includes('foreign key') || message.includes('violates')) {
        return badRequest('Item cannot be deleted because it is referenced by existing records.');
      }
      throw error;
    }

    await writeAuditEvent({
      req,
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      actorRole: auth.role,
      action: 'inventory.delete',
      resource: 'inventory',
      resourceId: normalizedId,
      outcome: 'success',
      before: beforeRecord,
      metadata: {
        item_name: beforeRecord?.item_name ?? null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError(error, req);
  }
}


