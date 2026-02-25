import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { badRequest, serverError } from '@/lib/api-response';
import { writeAuditEvent } from '@/lib/audit-log';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['owner']);
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

    const { item_name, category, quantity, unit_price } = await req.json();
    const parsedQuantity = Number(quantity);
    const parsedUnitPrice = Number(unit_price);

    if (!item_name || typeof item_name !== 'string' || item_name.trim().length === 0) {
      return badRequest('item_name is required');
    }
    if (!category || typeof category !== 'string' || category.trim().length === 0) {
      return badRequest('category is required');
    }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
      return badRequest('quantity must be a non-negative number');
    }
    if (!Number.isFinite(parsedUnitPrice) || parsedUnitPrice < 0) {
      return badRequest('unit_price must be a non-negative number');
    }

    const { data, error } = await supabase
      .from('inventory')
      .insert([
        {
          item_name: item_name.trim(),
          category: category.trim(),
          quantity: parsedQuantity,
          unit_price: parsedUnitPrice,
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

    const { id, quantity } = await req.json();
    const normalizedId =
      typeof id === 'number'
        ? id
        : typeof id === 'string'
          ? id.trim()
          : '';
    const parsedNumericId =
      typeof normalizedId === 'number' ? normalizedId : Number(normalizedId);
    const parsedQuantity = Number(quantity);

    if (
      (typeof normalizedId === 'number' && (!Number.isInteger(normalizedId) || normalizedId <= 0)) ||
      (typeof normalizedId === 'string' && normalizedId.length === 0)
    ) {
      return badRequest('id is required');
    }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
      return badRequest('quantity must be a non-negative number');
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

    const { data, error } = await supabase
      .from('inventory')
      .update({ quantity: parsedQuantity, updated_at: new Date() })
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
        updatedFields: ['quantity'],
      },
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return serverError(error, req);
  }
}

