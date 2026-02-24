import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { badRequest, serverError } from '@/lib/api-response';

const ALLOWED_STATUSES = new Set(['available', 'occupied', 'reserved']);

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['staff', 'manager', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { data, error } = await supabase
      .from('tables')
      .select('*')
      .order('table_number', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return serverError(error, req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['manager', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { table_number, capacity } = await req.json();
    const parsedTableNumber = Number(table_number);
    const parsedCapacity = Number(capacity);

    if (!Number.isInteger(parsedTableNumber) || parsedTableNumber <= 0) {
      return badRequest('table_number must be a positive integer');
    }
    if (!Number.isInteger(parsedCapacity) || parsedCapacity <= 0) {
      return badRequest('capacity must be a positive integer');
    }

    const { data, error } = await supabase
      .from('tables')
      .insert([{ table_number: parsedTableNumber, capacity: parsedCapacity, status: 'available' }])
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return serverError(error, req);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['staff', 'manager', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { id, status, customer_name } = await req.json();
    const parsedId = Number(id);
    const normalizedStatus = typeof status === 'string' ? status.trim() : '';

    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return badRequest('id must be a positive integer');
    }
    if (!ALLOWED_STATUSES.has(normalizedStatus)) {
      return badRequest('status must be one of: available, occupied, reserved');
    }
    if (customer_name !== undefined && customer_name !== null && typeof customer_name !== 'string') {
      return badRequest('customer_name must be a string');
    }

    const updateData: Record<string, unknown> = { status: normalizedStatus };
    if (normalizedStatus === 'available') {
      updateData.customer_name = null;
      updateData.order_amount = null;
    } else if (typeof customer_name === 'string' && customer_name.trim().length > 0) {
      updateData.customer_name = customer_name.trim();
    }

    const { data, error } = await supabase
      .from('tables')
      .update(updateData)
      .eq('id', parsedId)
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return serverError(error, req);
  }
}

