import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { badRequest, serverError } from '@/lib/api-response';

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
    return serverError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['manager', 'owner']);
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

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['manager', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { id, quantity } = await req.json();
    const parsedId = Number(id);
    const parsedQuantity = Number(quantity);

    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return badRequest('id must be a positive integer');
    }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
      return badRequest('quantity must be a non-negative number');
    }

    const { data, error } = await supabase
      .from('inventory')
      .update({ quantity: parsedQuantity, updated_at: new Date() })
      .eq('id', parsedId)
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return serverError(error);
  }
}
