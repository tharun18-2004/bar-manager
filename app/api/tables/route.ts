import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { badRequest, serverError } from '@/lib/api-response';

const ALLOWED_STATUSES = new Set(['available', 'occupied', 'cleaning']);

function toStorageStatus(status: string) {
  if (status === 'needs_cleaning') return 'cleaning';
  return status;
}

function toApiStatus(status: unknown) {
  if (status === 'needs_cleaning') return 'cleaning';
  return typeof status === 'string' ? status : '';
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['staff', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { data, error } = await supabase
      .from('tables')
      .select('*')
      .order('table_number', { ascending: true });

    if (error) throw error;

    const [availableCountResult, occupiedCountResult, cleaningCountResult] = await Promise.all([
      supabase.from('tables').select('*', { count: 'exact', head: true }).eq('status', 'available'),
      supabase.from('tables').select('*', { count: 'exact', head: true }).eq('status', 'occupied'),
      supabase.from('tables').select('*', { count: 'exact', head: true }).in('status', ['cleaning', 'needs_cleaning']),
    ]);

    if (availableCountResult.error) throw availableCountResult.error;
    if (occupiedCountResult.error) throw occupiedCountResult.error;
    if (cleaningCountResult.error) throw cleaningCountResult.error;

    const normalized = Array.isArray(data)
      ? data.map((row) => ({ ...row, status: toApiStatus(row.status) }))
      : [];
    return NextResponse.json({
      success: true,
      data: normalized,
      stats: {
        available: Number(availableCountResult.count ?? 0),
        occupied: Number(occupiedCountResult.count ?? 0),
        cleaning: Number(cleaningCountResult.count ?? 0),
      },
    });
  } catch (error) {
    return serverError(error, req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['owner']);
    if (auth instanceof NextResponse) return auth;

    const { table_number, table_label, capacity } = await req.json();
    const parsedTableNumber = Number(table_number);
    const parsedCapacity = Number(capacity);
    const normalizedLabel =
      typeof table_label === 'string' && table_label.trim().length > 0 ? table_label.trim() : null;

    if (!Number.isInteger(parsedTableNumber) || parsedTableNumber <= 0) {
      return badRequest('table_number must be a positive integer');
    }
    if (!Number.isInteger(parsedCapacity) || parsedCapacity <= 0) {
      return badRequest('capacity must be a positive integer');
    }

    const { data, error } = await supabase
      .from('tables')
      .insert([
        {
          table_number: parsedTableNumber,
          table_label: normalizedLabel,
          capacity: parsedCapacity,
          status: 'available',
        },
      ])
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return serverError(error, req);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['staff', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { id, status, customer_name, order_reference, order_amount } = await req.json();
    const parsedId = Number(id);
    const normalizedStatus = typeof status === 'string' ? status.trim() : '';
    const normalizedOrderReference =
      typeof order_reference === 'string' && order_reference.trim().length > 0 ? order_reference.trim() : null;
    const hasOrderAmount = order_amount !== undefined && order_amount !== null;
    const parsedOrderAmount = hasOrderAmount ? Number(order_amount) : null;

    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return badRequest('id must be a positive integer');
    }
    const normalizedApiStatus = toApiStatus(normalizedStatus);
    if (!ALLOWED_STATUSES.has(normalizedApiStatus)) {
      return badRequest('status must be one of: available, occupied, cleaning');
    }
    if (customer_name !== undefined && customer_name !== null && typeof customer_name !== 'string') {
      return badRequest('customer_name must be a string');
    }
    if (order_reference !== undefined && order_reference !== null && typeof order_reference !== 'string') {
      return badRequest('order_reference must be a string');
    }
    if (hasOrderAmount && (!Number.isFinite(parsedOrderAmount) || (parsedOrderAmount as number) < 0)) {
      return badRequest('order_amount must be a non-negative number');
    }

    const storageStatus = toStorageStatus(normalizedApiStatus);
    const updateData: Record<string, unknown> = { status: storageStatus };
    if (storageStatus === 'available' || storageStatus === 'cleaning') {
      updateData.customer_name = null;
      updateData.order_amount = null;
      updateData.order_reference = null;
    } else if (typeof customer_name === 'string' && customer_name.trim().length > 0) {
      updateData.customer_name = customer_name.trim();
    }
    if (storageStatus === 'occupied') {
      if (normalizedOrderReference !== null) {
        updateData.order_reference = normalizedOrderReference;
      }
      if (hasOrderAmount) {
        updateData.order_amount = parsedOrderAmount;
      }
    }

    const { data, error } = await supabase
      .from('tables')
      .update(updateData)
      .eq('id', parsedId)
      .select();

    if (error) throw error;

    const normalized = Array.isArray(data)
      ? data.map((row) => ({ ...row, status: toApiStatus(row.status) }))
      : [];
    return NextResponse.json({ success: true, data: normalized });
  } catch (error) {
    return serverError(error, req);
  }
}


