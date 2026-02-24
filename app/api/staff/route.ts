import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { badRequest, serverError } from '@/lib/api-response';
import { writeAuditEvent } from '@/lib/audit-log';

const ALLOWED_ROLES = new Set(['bartender', 'waiter', 'manager']);

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['manager', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { data, error } = await supabase
      .from('staff')
      .select('id, name, email, role, created_at')
      .order('name', { ascending: true });

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

    const { name, email, role } = await req.json();
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedEmail = typeof email === 'string' ? email.trim() : '';
    const normalizedRole = typeof role === 'string' ? role.trim() : '';

    if (!normalizedName) return badRequest('name is required');
    if (!normalizedEmail || !normalizedEmail.includes('@')) return badRequest('email must be valid');
    if (!ALLOWED_ROLES.has(normalizedRole)) {
      return badRequest('role must be one of: bartender, waiter, manager');
    }

    const { data, error } = await supabase
      .from('staff')
      .insert([{ name: normalizedName, email: normalizedEmail, role: normalizedRole }])
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return serverError(error, req);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['owner']);
    if (auth instanceof NextResponse) return auth;

    const { id, name, email, role } = await req.json();
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return badRequest('id must be a positive integer');
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return badRequest('name must be a non-empty string');
      }
      updateData.name = name.trim();
    }
    if (email !== undefined) {
      if (typeof email !== 'string' || !email.includes('@')) {
        return badRequest('email must be valid');
      }
      updateData.email = email.trim();
    }
    if (role !== undefined) {
      if (typeof role !== 'string' || !ALLOWED_ROLES.has(role.trim())) {
        return badRequest('role must be one of: bartender, waiter, manager');
      }
      updateData.role = role.trim();
    }

    if (Object.keys(updateData).length === 0) {
      return badRequest('at least one field is required to update');
    }

    const { data: existingRows, error: existingError } = await supabase
      .from('staff')
      .select('id, name, email, role')
      .eq('id', parsedId)
      .limit(1);
    if (existingError) throw existingError;
    const beforeRecord = existingRows?.[0] ?? null;

    const { data, error } = await supabase
      .from('staff')
      .update(updateData)
      .eq('id', parsedId)
      .select();

    if (error) throw error;

    await writeAuditEvent({
      req,
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      actorRole: auth.role,
      action: 'staff.update',
      resource: 'staff',
      resourceId: parsedId,
      outcome: 'success',
      before: beforeRecord,
      after: data?.[0] ?? null,
      metadata: {
        updatedFields: Object.keys(updateData),
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
    const id = Number(searchParams.get('id'));

    if (!Number.isInteger(id) || id <= 0) {
      return badRequest('id must be a positive integer');
    }

    const { data: existingRows, error: existingError } = await supabase
      .from('staff')
      .select('id, name, email, role')
      .eq('id', id)
      .limit(1);
    if (existingError) throw existingError;
    const beforeRecord = existingRows?.[0] ?? null;

    const { error } = await supabase
      .from('staff')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await writeAuditEvent({
      req,
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      actorRole: auth.role,
      action: 'staff.delete',
      resource: 'staff',
      resourceId: id,
      outcome: 'success',
      before: beforeRecord,
      after: null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError(error, req);
  }
}

