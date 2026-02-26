import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { badRequest, serverError } from '@/lib/api-response';
import { writeAuditEvent } from '@/lib/audit-log';

const PRODUCT_CATEGORIES = new Set(['Beer', 'Whisky', 'Rum', 'Vodka']);

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['staff', 'manager', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .order('category', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ success: true, data });
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
      selling_price,
      stock_quantity,
      current_stock_ml,
      quantity,
      unit_price,
    } = await req.json();
    const parsedBottleSizeMl = Number(bottle_size_ml);
    const parsedCostPrice = Number(cost_price);
    const parsedSellingPrice = Number(selling_price ?? unit_price);
    const parsedStockQuantity = Number(stock_quantity ?? quantity);
    const parsedCurrentStockMlRaw =
      current_stock_ml === undefined || current_stock_ml === null ? null : Number(current_stock_ml);

    if (!item_name || typeof item_name !== 'string' || item_name.trim().length === 0) {
      return badRequest('item_name is required');
    }
    if (!brand_name || typeof brand_name !== 'string' || brand_name.trim().length === 0) {
      return badRequest('brand_name is required');
    }
    if (!category || typeof category !== 'string' || category.trim().length === 0) {
      return badRequest('category is required');
    }
    if (!PRODUCT_CATEGORIES.has(category.trim())) {
      return badRequest('category must be one of: Beer, Whisky, Rum, Vodka');
    }
    if (!Number.isFinite(parsedBottleSizeMl) || parsedBottleSizeMl <= 0) {
      return badRequest('bottle_size_ml must be a positive number');
    }
    if (!Number.isFinite(parsedCostPrice) || parsedCostPrice < 0) {
      return badRequest('cost_price must be a non-negative number');
    }
    if (!Number.isFinite(parsedSellingPrice) || parsedSellingPrice < 0) {
      return badRequest('selling_price must be a non-negative number');
    }
    if (!Number.isFinite(parsedStockQuantity) || parsedStockQuantity < 0) {
      return badRequest('stock_quantity must be a non-negative number');
    }
    if (
      parsedCurrentStockMlRaw !== null &&
      (!Number.isFinite(parsedCurrentStockMlRaw) || parsedCurrentStockMlRaw < 0)
    ) {
      return badRequest('current_stock_ml must be a non-negative number');
    }
    const parsedCurrentStockMl =
      parsedCurrentStockMlRaw === null ? parsedStockQuantity * parsedBottleSizeMl : parsedCurrentStockMlRaw;

    const { data, error } = await supabase
      .from('inventory')
      .insert([
        {
          item_name: item_name.trim(),
          brand_name: brand_name.trim(),
          category: category.trim(),
          bottle_size_ml: parsedBottleSizeMl,
          cost_price: parsedCostPrice,
          selling_price: parsedSellingPrice,
          stock_quantity: parsedStockQuantity,
          current_stock_ml: parsedCurrentStockMl,
          // Legacy columns kept in sync.
          quantity: parsedStockQuantity,
          unit_price: parsedSellingPrice,
        },
      ])
      .select();

    if (error) throw error;

    await writeAuditEvent({
      req,
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      actorRole: auth.role,
      action: 'inventory.create',
      resource: 'inventory',
      resourceId: data?.[0]?.id ?? null,
      outcome: 'success',
      after: data?.[0] ?? null,
      metadata: {
        item_name: data?.[0]?.item_name ?? item_name.trim(),
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
      selling_price,
      bottle_size_ml,
      category,
      brand_name,
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
    const parsedCostPrice = Number(cost_price);
    const hasSellingPrice = selling_price !== undefined;
    const parsedSellingPrice = Number(selling_price);
    const hasBottleSizeMl = bottle_size_ml !== undefined;
    const parsedBottleSizeMl = Number(bottle_size_ml);

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
      return badRequest('cost_price must be a non-negative number');
    }
    if (hasSellingPrice && (!Number.isFinite(parsedSellingPrice) || parsedSellingPrice < 0)) {
      return badRequest('selling_price must be a non-negative number');
    }
    if (hasBottleSizeMl && (!Number.isFinite(parsedBottleSizeMl) || parsedBottleSizeMl <= 0)) {
      return badRequest('bottle_size_ml must be a positive number');
    }
    if (category !== undefined && (typeof category !== 'string' || !PRODUCT_CATEGORIES.has(category.trim()))) {
      return badRequest('category must be one of: Beer, Whisky, Rum, Vodka');
    }
    if (brand_name !== undefined && (typeof brand_name !== 'string' || brand_name.trim().length === 0)) {
      return badRequest('brand_name must be a non-empty string');
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

    if (hasCostPrice) {
      updateData.cost_price = parsedCostPrice;
      updatedFields.push('cost_price');
    }
    if (hasSellingPrice) {
      updateData.selling_price = parsedSellingPrice;
      updateData.unit_price = parsedSellingPrice;
      updatedFields.push('selling_price', 'unit_price');
    }
    if (hasBottleSizeMl) {
      updateData.bottle_size_ml = parsedBottleSizeMl;
      updatedFields.push('bottle_size_ml');
    }
    if (category !== undefined) {
      updateData.category = category.trim();
      updatedFields.push('category');
    }
    if (brand_name !== undefined) {
      updateData.brand_name = brand_name.trim();
      updatedFields.push('brand_name');
    }

    const { data, error } = await supabase
      .from('inventory')
      .update(updateData)
      .eq('id', targetId)
      .select();

    if (error) throw error;

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

