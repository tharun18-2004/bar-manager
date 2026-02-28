import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { badRequest, serverError } from '@/lib/api-response';
import { writeAuditEvent } from '@/lib/audit-log';

const PAYMENT_METHODS = new Set(['CASH', 'CARD', 'UPI', 'COMPLIMENTARY']);

type TabItemInput = {
  name?: string;
  inventory_id?: string;
  inventory_size_id?: string | null;
  quantity?: number;
  unit_price?: number;
  peg_size_ml?: number;
  size_label?: string;
  line_total?: number;
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

function isMissingCreatedByColumnError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return message.includes("Could not find the 'created_by' column");
}

function isNoRowsError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: unknown }).code ?? '');
    if (code === 'PGRST116') return true;
  }
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('0 rows') || message.includes('no rows');
}

async function resolveInventorySizeId(
  inventoryId: string,
  requestedInventorySizeId: string | null
): Promise<string> {
  let normalizedInventorySizeId =
    requestedInventorySizeId && !requestedInventorySizeId.startsWith('auto:')
      ? requestedInventorySizeId
      : null;

  if (!normalizedInventorySizeId) {
    const { data: sizeRows, error: sizeLookupError } = await supabase
      .from('inventory_sizes')
      .select('id')
      .eq('inventory_id', inventoryId)
      .eq('is_active', true)
      .order('size_ml', { ascending: true })
      .limit(1);
    if (sizeLookupError) throw sizeLookupError;
    normalizedInventorySizeId = sizeRows?.[0]?.id ? String(sizeRows[0].id) : null;
  }

  if (!normalizedInventorySizeId) {
    const { data: inventoryRows, error: inventoryError } = await supabase
      .from('inventory')
      .select('id, selling_price, sale_price, unit_price')
      .eq('id', inventoryId)
      .limit(1);
    if (inventoryError) throw inventoryError;
    const inventoryRow = inventoryRows?.[0];
    if (!inventoryRow) throw new Error('inventory item not found');

    const defaultSellingPrice = Number(
      inventoryRow.selling_price ?? inventoryRow.sale_price ?? inventoryRow.unit_price ?? 0
    );
    if (!Number.isFinite(defaultSellingPrice) || defaultSellingPrice <= 0) {
      throw new Error('inventory item has no selling price configured');
    }

    const { error: upsertError } = await supabase
      .from('inventory_sizes')
      .upsert(
        [
          {
            inventory_id: inventoryId,
            size_label: 'Peg 60 ml',
            size_ml: 60,
            selling_price: defaultSellingPrice,
            is_active: true,
          },
        ],
        { onConflict: 'inventory_id,size_ml' }
      );
    if (upsertError) throw upsertError;

    const { data: createdSizeRows, error: createdSizeLookupError } = await supabase
      .from('inventory_sizes')
      .select('id')
      .eq('inventory_id', inventoryId)
      .eq('size_ml', 60)
      .limit(1);
    if (createdSizeLookupError) throw createdSizeLookupError;
    normalizedInventorySizeId = createdSizeRows?.[0]?.id ? String(createdSizeRows[0].id) : null;
  }

  if (!normalizedInventorySizeId) throw new Error('Failed to resolve inventory size for tab item');
  return normalizedInventorySizeId;
}

async function createOrderWithFallback(
  orderPayloadWithCreator: Record<string, unknown>,
  orderPayloadWithoutCreator: Record<string, unknown>
) {
  const withCreatorResult = await supabase
    .from('orders')
    .insert([orderPayloadWithCreator])
    .select()
    .single();

  if (withCreatorResult.error) {
    if (!isMissingCreatedByColumnError(withCreatorResult.error)) {
      throw withCreatorResult.error;
    }
    const fallbackResult = await supabase
      .from('orders')
      .insert([orderPayloadWithoutCreator])
      .select()
      .single();
    if (fallbackResult.error) throw fallbackResult.error;
    return fallbackResult.data;
  }

  return withCreatorResult.data;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['staff', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') ?? 'open').trim().toLowerCase();
    if (!['open', 'closed', 'cancelled'].includes(status)) {
      return badRequest('status must be one of: open, closed, cancelled');
    }

    const { data, error } = await supabase
      .from('tabs')
      .select('*')
      .eq('status', status)
      .order('opened_at', { ascending: false })
      .limit(100);

    if (error) {
      if (isRelationMissingError(error, 'tabs')) {
        return NextResponse.json({
          success: true,
          data: [],
          warning: 'tabs table is not available in this environment',
        });
      }
      throw error;
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return serverError(error, req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['staff', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const action = typeof body?.action === 'string' ? body.action.trim().toLowerCase() : '';

    if (action === 'open') {
      const customerName = typeof body?.customer_name === 'string' ? body.customer_name.trim() : '';
      const tableLabel = typeof body?.table_label === 'string' ? body.table_label.trim() : '';
      if (!customerName) return badRequest('customer_name is required');

      const tabCode = `TAB-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Date.now()}`;
      const { data, error } = await supabase
        .from('tabs')
        .insert([
          {
            tab_code: tabCode,
            customer_name: customerName,
            table_label: tableLabel || null,
            status: 'open',
            opened_by: auth.user.email ?? 'staff',
            opened_by_user_id: auth.user.id,
          },
        ])
        .select()
        .single();
      if (error) throw error;

      await writeAuditEvent({
        req,
        actorId: auth.user.id,
        actorEmail: auth.user.email ?? null,
        actorRole: auth.role,
        action: 'tab.open',
        resource: 'tabs',
        resourceId: data?.id ?? null,
        after: data ?? null,
      });

      return NextResponse.json({ success: true, data }, { status: 201 });
    }

    if (action === 'add_items') {
      const tabId = typeof body?.tab_id === 'string' ? body.tab_id.trim() : '';
      const items = Array.isArray(body?.items) ? (body.items as TabItemInput[]) : [];
      if (!tabId) return badRequest('tab_id is required');
      if (items.length === 0) return badRequest('items must be a non-empty array');

      const { data: tabRow, error: tabError } = await supabase
        .from('tabs')
        .select('*')
        .eq('id', tabId)
        .eq('status', 'open')
        .single();
      if (tabError) {
        if (isNoRowsError(tabError)) return badRequest('open tab not found');
        throw tabError;
      }

      const normalizedRows: Array<{
        tab_id: string;
        item_name: string;
        inventory_id: string;
        inventory_size_id: string | null;
        size_label: string | null;
        size_ml: number | null;
        unit_price: number;
        quantity: number;
        line_total: number;
        added_by: string;
      }> = [];
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const quantity = Number(item.quantity ?? 0);
        const unitPrice = Number(item.unit_price ?? 0);
        const fallbackLineTotal = Number((quantity * unitPrice).toFixed(2));
        const lineTotal = Number(item.line_total ?? fallbackLineTotal);
        if (
          !item.inventory_id ||
          typeof item.inventory_id !== 'string' ||
          item.inventory_id.trim().length === 0 ||
          !Number.isInteger(quantity) ||
          quantity <= 0 ||
          !Number.isFinite(unitPrice) ||
          unitPrice < 0 ||
          !Number.isFinite(lineTotal) ||
          lineTotal < 0
        ) {
          return badRequest(`items[${index}] has invalid quantity/price/inventory_id`);
        }
        normalizedRows.push({
          tab_id: tabId,
          item_name: typeof item.name === 'string' && item.name.trim().length > 0 ? item.name.trim() : 'Item',
          inventory_id: item.inventory_id.trim(),
          inventory_size_id:
            typeof item.inventory_size_id === 'string' && item.inventory_size_id.trim().length > 0
              ? item.inventory_size_id.trim()
              : null,
          size_label:
            typeof item.size_label === 'string' && item.size_label.trim().length > 0
              ? item.size_label.trim()
              : null,
          size_ml: Number.isFinite(Number(item.peg_size_ml)) ? Number(item.peg_size_ml) : null,
          unit_price: unitPrice,
          quantity,
          line_total: lineTotal,
          added_by: auth.user.email ?? 'staff',
        });
      }

      const { data: insertedRows, error: insertError } = await supabase
        .from('tab_items')
        .insert(normalizedRows)
        .select();
      if (insertError) {
        if (isRelationMissingError(insertError, 'tab_items')) {
          return badRequest('tab_items table is missing. Run running-tab migration and reload schema.');
        }
        throw insertError;
      }

      const addedTotal = normalizedRows.reduce((sum, item) => sum + Number(item.line_total), 0);
      const nextTotal = Number(tabRow.total_amount ?? 0) + addedTotal;

      const { data: updatedTab, error: updateError } = await supabase
        .from('tabs')
        .update({ total_amount: Number(nextTotal.toFixed(2)), updated_at: new Date().toISOString() })
        .eq('id', tabId)
        .select()
        .single();
      if (updateError) throw updateError;

      await writeAuditEvent({
        req,
        actorId: auth.user.id,
        actorEmail: auth.user.email ?? null,
        actorRole: auth.role,
        action: 'tab.add_items',
        resource: 'tabs',
        resourceId: tabId,
        metadata: {
          added_items: normalizedRows.length,
          added_total: Number(addedTotal.toFixed(2)),
        },
        after: updatedTab,
      });

      return NextResponse.json({ success: true, data: { tab: updatedTab, items: insertedRows } });
    }

    if (action === 'close') {
      const tabId = typeof body?.tab_id === 'string' ? body.tab_id.trim() : '';
      const rawPaymentMethod = typeof body?.payment_method === 'string' ? body.payment_method : 'COMPLIMENTARY';
      const normalizedPaymentMethod = rawPaymentMethod.trim().toUpperCase();
      if (!tabId) return badRequest('tab_id is required');
      if (!PAYMENT_METHODS.has(normalizedPaymentMethod)) {
        return badRequest('payment_method must be one of: CASH, CARD, UPI, COMPLIMENTARY');
      }

      const { data: tabRow, error: tabError } = await supabase
        .from('tabs')
        .select('*')
        .eq('id', tabId)
        .eq('status', 'open')
        .single();
      if (tabError) {
        if (isNoRowsError(tabError)) return badRequest('open tab not found');
        throw tabError;
      }

      const { data: tabItems, error: itemsError } = await supabase
        .from('tab_items')
        .select('*')
        .eq('tab_id', tabId)
        .order('added_at', { ascending: true });
      if (itemsError) throw itemsError;
      if (!tabItems || tabItems.length === 0) {
        return badRequest('tab has no items');
      }

      const orderItems = tabItems.map((item) => ({
        item_id: item.inventory_id,
        name: item.item_name,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        peg_size_ml: Number(item.size_ml ?? 0),
        line_total: Number(item.line_total),
      }));
      const totalAmount = Number(
        orderItems.reduce((sum, item) => sum + Number(item.line_total), 0).toFixed(2)
      );

      const normalizedOrderId = `TAB-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Date.now()}`;
      const orderData = await createOrderWithFallback(
        {
          order_id: normalizedOrderId,
          staff_name: auth.user.email ?? 'staff',
          created_by: auth.user.id,
          total_amount: totalAmount,
          payment_method: normalizedPaymentMethod,
          items: orderItems,
          status: 'completed',
        },
        {
          order_id: normalizedOrderId,
          staff_name: auth.user.email ?? 'staff',
          total_amount: totalAmount,
          payment_method: normalizedPaymentMethod,
          items: orderItems,
          status: 'completed',
        }
      );

      for (const item of tabItems) {
        const inventoryId = String(item.inventory_id ?? '').trim();
        if (!inventoryId) throw new Error('tab item inventory_id is invalid');
        const requestedSizeId =
          typeof item.inventory_size_id === 'string' && item.inventory_size_id.trim().length > 0
            ? item.inventory_size_id.trim()
            : null;
        const resolvedSizeId = await resolveInventorySizeId(inventoryId, requestedSizeId);
        const quantity = Number(item.quantity ?? 0);
        if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('tab item quantity is invalid');

        const { error: salesError } = await supabase.rpc('create_sale_with_stock', {
          p_inventory_id: inventoryId,
          p_inventory_size_id: resolvedSizeId,
          p_quantity: quantity,
          p_staff_name: auth.user.email ?? 'staff',
        });
        if (salesError) {
          const message = getErrorMessage(salesError).toLowerCase();
          if (message.includes('insufficient stock')) {
            return badRequest(`Insufficient stock while closing tab for ${item.item_name}.`);
          }
          if (message.includes('inventory item not found')) {
            return badRequest(`Inventory item missing for ${item.item_name}.`);
          }
          throw salesError;
        }
      }

      const { data: closedTab, error: closeError } = await supabase
        .from('tabs')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          payment_method: normalizedPaymentMethod,
          order_id: orderData?.order_id ?? normalizedOrderId,
          total_amount: totalAmount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tabId)
        .select()
        .single();
      if (closeError) throw closeError;

      await writeAuditEvent({
        req,
        actorId: auth.user.id,
        actorEmail: auth.user.email ?? null,
        actorRole: auth.role,
        action: 'tab.close',
        resource: 'tabs',
        resourceId: tabId,
        metadata: {
          payment_method: normalizedPaymentMethod,
          order_id: orderData?.order_id ?? normalizedOrderId,
          total_amount: totalAmount,
        },
        after: closedTab,
      });

      return NextResponse.json({
        success: true,
        data: {
          tab: closedTab,
          order: orderData,
          items: tabItems.length,
        },
      });
    }

    return badRequest('action must be one of: open, add_items, close');
  } catch (error) {
    return serverError(error, req);
  }
}

