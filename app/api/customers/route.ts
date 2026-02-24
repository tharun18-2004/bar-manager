import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { badRequest, serverError } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['manager', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('total_spent', { ascending: false });

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

    const { name, phone, email } = await req.json();
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedPhone = typeof phone === 'string' ? phone.trim() : '';
    const normalizedEmail = typeof email === 'string' ? email.trim() : '';

    if (!normalizedName) {
      return badRequest('name is required');
    }
    if (!normalizedPhone) {
      return badRequest('phone is required');
    }
    if (normalizedEmail && !normalizedEmail.includes('@')) {
      return badRequest('email must be valid');
    }

    const { data, error } = await supabase
      .from('customers')
      .insert([
        {
          name: normalizedName,
          phone: normalizedPhone,
          email: normalizedEmail || null,
          total_spent: 0,
          visit_count: 0,
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
    const auth = await requireAuth(req, ['manager', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { id, name, phone, email, total_spent, visit_count } = await req.json();
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return badRequest('id must be a positive integer');
    }

    const updateData: Record<string, unknown> = { updated_at: new Date() };
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return badRequest('name must be a non-empty string');
      }
      updateData.name = name.trim();
    }
    if (phone !== undefined) {
      if (typeof phone !== 'string' || phone.trim().length === 0) {
        return badRequest('phone must be a non-empty string');
      }
      updateData.phone = phone.trim();
    }
    if (email !== undefined) {
      if (email !== null && (typeof email !== 'string' || (email.trim().length > 0 && !email.includes('@')))) {
        return badRequest('email must be valid');
      }
      updateData.email = typeof email === 'string' ? email.trim() || null : null;
    }
    if (total_spent !== undefined) {
      const parsedTotalSpent = Number(total_spent);
      if (!Number.isFinite(parsedTotalSpent) || parsedTotalSpent < 0) {
        return badRequest('total_spent must be a non-negative number');
      }
      updateData.total_spent = parsedTotalSpent;
    }
    if (visit_count !== undefined) {
      const parsedVisitCount = Number(visit_count);
      if (!Number.isInteger(parsedVisitCount) || parsedVisitCount < 0) {
        return badRequest('visit_count must be a non-negative integer');
      }
      updateData.visit_count = parsedVisitCount;
    }
    if (Object.keys(updateData).length === 1) {
      return badRequest('at least one field is required to update');
    }

    const { data, error } = await supabase
      .from('customers')
      .update(updateData)
      .eq('id', parsedId)
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return serverError(error, req);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['manager', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get('id'));

    if (!Number.isInteger(id) || id <= 0) {
      return badRequest('Customer ID must be a positive integer');
    }

    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Customer deleted successfully' });
  } catch (error) {
    return serverError(error, req);
  }
}

