import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { badRequest, serverError } from '@/lib/api-response';
import { supabase } from '@/lib/supabase';
import { writeAuditEvent } from '@/lib/audit-log';

type ImportRow = {
  item_name?: unknown;
  opening_stock?: unknown;
  received?: unknown;
  sold?: unknown;
  category?: unknown;
};

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function parseStockValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['owner']);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const rows = Array.isArray(body?.rows) ? (body.rows as ImportRow[]) : [];
    if (rows.length === 0) {
      return badRequest('rows must be a non-empty array');
    }

    let imported = 0;
    const errors: string[] = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const rawName = typeof row.item_name === 'string' ? row.item_name : '';
      const itemName = normalizeName(rawName);
      if (!itemName) {
        errors.push(`Row ${index + 1}: item_name is required`);
        continue;
      }

      const openingStock = parseStockValue(row.opening_stock);
      const receivedStock = parseStockValue(row.received);
      const soldStock = parseStockValue(row.sold);
      const closingStock = Math.max(0, openingStock + receivedStock - soldStock);

      const { data: existingRows, error: existingError } = await supabase
        .from('inventory')
        .select('id, bottle_size_ml, item_name')
        .ilike('item_name', itemName)
        .limit(5);
      if (existingError) throw existingError;

      const matchedRow = (existingRows ?? []).find(
        (entry) => normalizeName(String(entry?.item_name ?? '')).toLowerCase() === itemName.toLowerCase()
      ) ?? null;

      const bottleSizeMl = Number(matchedRow?.bottle_size_ml ?? 750);
      const currentStockMl = closingStock * (Number.isFinite(bottleSizeMl) && bottleSizeMl > 0 ? bottleSizeMl : 750);

      if (matchedRow?.id) {
        const { error: updateError } = await supabase
          .from('inventory')
          .update({
            stock_quantity: closingStock,
            quantity: closingStock,
            current_stock_ml: currentStockMl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', matchedRow.id);
        if (updateError) throw updateError;
      } else {
        const fallbackCategory = typeof row.category === 'string' && row.category.trim().length > 0
          ? row.category.trim()
          : 'Beer';
        const { error: insertError } = await supabase
          .from('inventory')
          .insert([
            {
              item_name: itemName,
              name: itemName,
              brand_name: itemName,
              category: fallbackCategory,
              bottle_size_ml: 750,
              cost_price: 0,
              selling_price: 0,
              sale_price: 0,
              stock_quantity: closingStock,
              quantity: closingStock,
              current_stock_ml: closingStock * 750,
              unit_price: 0,
            },
          ]);
        if (insertError) throw insertError;
      }

      imported += 1;
    }

    await writeAuditEvent({
      req,
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      actorRole: auth.role,
      action: 'inventory.import',
      resource: 'inventory',
      metadata: {
        imported_rows: imported,
        total_rows: rows.length,
        failed_rows: errors.length,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        imported,
        failed: errors.length,
        errors,
      },
    });
  } catch (error) {
    return serverError(error, req);
  }
}
