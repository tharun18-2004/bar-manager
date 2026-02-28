import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { badRequest, serverError } from '@/lib/api-response';
import { writeAuditEvent } from '@/lib/audit-log';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: 'owner' | 'staff';
  is_active: boolean;
  created_at: string;
};

function isUsersTableMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = 'message' in error && typeof error.message === 'string' ? error.message.toLowerCase() : '';
  return (
    message.includes("could not find the table 'public.users'") ||
    message.includes('relation "public.users" does not exist') ||
    message.includes("relation 'public.users' does not exist")
  );
}

function usersTableMissingResponse() {
  return NextResponse.json(
    {
      success: false,
      error:
        "Database table public.users is missing. Run db/migrations/2026-02-24_create_users_table.sql, then db/migrations/2026-02-28_simplify_roles_owner_staff.sql.",
    },
    { status: 500 }
  );
}

function isUsersMissingColumnError(error: unknown, column: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = 'message' in error && typeof error.message === 'string' ? error.message.toLowerCase() : '';
  return (
    (message.includes(`column users.${column}`) && message.includes('does not exist')) ||
    (message.includes(`column "users"."${column}"`) && message.includes('does not exist')) ||
    (message.includes(`could not find the '${column}' column of 'users'`))
  );
}

function normalizeUserRow(row: Record<string, unknown>): UserRow {
  return {
    id: String(row.id ?? ''),
    name: row.name === null || row.name === undefined ? null : String(row.name),
    email: row.email === null || row.email === undefined ? null : String(row.email),
    role: String(row.role ?? 'staff').toLowerCase() === 'owner' ? 'owner' : 'staff',
    is_active: row.is_active !== false,
    created_at: String(row.created_at ?? ''),
  };
}

function foreignKeyDeleteResponse(error: unknown) {
  if (!error || typeof error !== 'object') return null;

  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
  const message = 'message' in error && typeof error.message === 'string' ? error.message.toLowerCase() : '';
  const details = 'details' in error && typeof error.details === 'string' ? error.details.toLowerCase() : '';
  const hint = 'hint' in error && typeof error.hint === 'string' ? error.hint : '';

  if (code !== '23503' && !message.includes('foreign key')) return null;

  let source = 'existing operational records';
  const combined = `${message} ${details}`;
  if (combined.includes('shift_logs')) source = 'shift logs';
  else if (combined.includes('tabs')) source = 'tab records';
  else if (combined.includes('stock_register')) source = 'stock register records';
  else if (combined.includes('month_closures')) source = 'month closure records';

  return NextResponse.json(
    {
      success: false,
      error: `Staff account cannot be deleted because it is referenced by ${source}.`,
      hint: hint || 'Keep the account for history/audit integrity.',
    },
    { status: 409 }
  );
}

function isUuid(value: string) {
  return UUID_RE.test(value);
}

function normalizeStaffRole(rawRole: unknown): 'staff' | null {
  if (rawRole === undefined || rawRole === null || rawRole === '') return 'staff';
  if (typeof rawRole !== 'string') return null;
  return rawRole.trim().toLowerCase() === 'staff' ? 'staff' : null;
}

function authCreateError(error: { message?: string; status?: number } | null) {
  if (!error) return null;
  const message = error.message ?? 'Failed to create auth user';
  if (message.toLowerCase().includes('already been registered')) {
    return NextResponse.json({ success: false, error: 'Email is already registered' }, { status: 409 });
  }
  return NextResponse.json({ success: false, error: message }, { status: error.status ?? 400 });
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['owner']);
    if (auth instanceof NextResponse) return auth;

    const resultWithIsActive = await supabase
      .from('users')
      .select('id, name, email, role, is_active, created_at')
      .eq('role', 'staff')
      .order('created_at', { ascending: false });

    if (resultWithIsActive.error && isUsersMissingColumnError(resultWithIsActive.error, 'is_active')) {
      const fallbackResult = await supabase
        .from('users')
        .select('id, name, email, role, created_at')
        .eq('role', 'staff')
        .order('created_at', { ascending: false });

      if (fallbackResult.error) throw fallbackResult.error;

      const rows = (Array.isArray(fallbackResult.data) ? fallbackResult.data : []).map((row) =>
        normalizeUserRow(row as Record<string, unknown>)
      );
      return NextResponse.json({ success: true, data: rows });
    }

    if (resultWithIsActive.error) throw resultWithIsActive.error;

    const rows = (Array.isArray(resultWithIsActive.data) ? resultWithIsActive.data : []).map((row) =>
      normalizeUserRow(row as Record<string, unknown>)
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    if (isUsersTableMissingError(error)) return usersTableMissingResponse();
    return serverError(error, req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['owner']);
    if (auth instanceof NextResponse) return auth;

    const { name, email, password, role } = await req.json();
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedPassword = typeof password === 'string' ? password : '';
    const normalizedRole = normalizeStaffRole(role);

    if (!normalizedName) return badRequest('name is required');
    if (!normalizedEmail || !normalizedEmail.includes('@')) return badRequest('email must be valid');
    if (normalizedPassword.length < 6) return badRequest('password must be at least 6 characters');
    if (!normalizedRole) return badRequest('role must be staff');

    const admin = getSupabaseAdminClient();
    const { data: authCreateData, error: authCreateErrorData } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password: normalizedPassword,
      email_confirm: true,
      user_metadata: { role: 'staff' },
      app_metadata: { role: 'staff' },
    });

    const authCreateFailure = authCreateError(authCreateErrorData);
    if (authCreateFailure) return authCreateFailure;
    const createdAuthUserId = authCreateData.user?.id;
    if (!createdAuthUserId) {
      return NextResponse.json({ success: false, error: 'Auth user was not created' }, { status: 500 });
    }

    let insertResult = await supabase
      .from('users')
      .insert([{ id: createdAuthUserId, name: normalizedName, email: normalizedEmail, role: 'staff', is_active: true }])
      .select('id, name, email, role, is_active, created_at')
      .single();

    if (insertResult.error && isUsersMissingColumnError(insertResult.error, 'is_active')) {
      insertResult = await supabase
        .from('users')
        .insert([{ id: createdAuthUserId, name: normalizedName, email: normalizedEmail, role: 'staff' }])
        .select('id, name, email, role, created_at')
        .single();
    }

    if (insertResult.error) {
      await admin.auth.admin.deleteUser(createdAuthUserId);
      throw insertResult.error;
    }
    const userRow = normalizeUserRow(insertResult.data as Record<string, unknown>);

    await writeAuditEvent({
      req,
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      actorRole: auth.role,
      action: 'staff.create',
      resource: 'users',
      resourceId: userRow?.id ?? createdAuthUserId,
      outcome: 'success',
      after: userRow,
      metadata: {
        createdFields: ['id', 'name', 'email', 'role'],
      },
    });

    return NextResponse.json({ success: true, data: userRow }, { status: 201 });
  } catch (error) {
    if (isUsersTableMissingError(error)) return usersTableMissingResponse();
    return serverError(error, req);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['owner']);
    if (auth instanceof NextResponse) return auth;

    const { id, name, email, role, is_active } = await req.json();
    const userId = typeof id === 'string' ? id.trim() : '';
    if (!isUuid(userId)) {
      return badRequest('id must be a valid UUID');
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
      updateData.email = email.trim().toLowerCase();
    }
    if (role !== undefined) {
      if (normalizeStaffRole(role) !== 'staff') {
        return badRequest('role must be staff');
      }
      updateData.role = 'staff';
    }
    if (is_active !== undefined) {
      if (typeof is_active !== 'boolean') {
        return badRequest('is_active must be a boolean');
      }
      updateData.is_active = is_active;
    }

    if (Object.keys(updateData).length === 0) {
      return badRequest('at least one field is required to update');
    }

    const { data: existingRow, error: existingError } = await supabase
      .from('users')
      .select('id, name, email, role')
      .eq('id', userId)
      .maybeSingle();
    if (existingError) throw existingError;

    let updateResult = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select('id, name, email, role, is_active, created_at')
      .single();

    if (updateResult.error && isUsersMissingColumnError(updateResult.error, 'is_active')) {
      const fallbackUpdateData = { ...updateData };
      delete fallbackUpdateData.is_active;
      updateResult = await supabase
        .from('users')
        .update(fallbackUpdateData)
        .eq('id', userId)
        .select('id, name, email, role, created_at')
        .single();
    }

    if (updateResult.error) throw updateResult.error;
    const data = normalizeUserRow(updateResult.data as Record<string, unknown>);

    await writeAuditEvent({
      req,
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      actorRole: auth.role,
      action: typeof is_active === 'boolean' ? 'staff.status' : 'staff.update',
      resource: 'users',
      resourceId: userId,
      outcome: 'success',
      before: existingRow ?? null,
      after: data,
      metadata: {
        updatedFields: Object.keys(updateData),
      },
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (isUsersTableMissingError(error)) return usersTableMissingResponse();
    return serverError(error, req);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['owner']);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const id = (searchParams.get('id') ?? '').trim();
    if (!isUuid(id)) {
      return badRequest('id must be a valid UUID');
    }
    if (id === auth.user.id) {
      return badRequest('owner cannot delete their own account');
    }

    let existingResult = await supabase
      .from('users')
      .select('id, name, email, role, is_active')
      .eq('id', id)
      .maybeSingle();

    if (existingResult.error && isUsersMissingColumnError(existingResult.error, 'is_active')) {
      existingResult = await supabase
        .from('users')
        .select('id, name, email, role, created_at')
        .eq('id', id)
        .maybeSingle();
    }
    if (existingResult.error) throw existingResult.error;

    const normalizedExistingRow = existingResult.data as Record<string, unknown> | null;

    if (!normalizedExistingRow) {
      return NextResponse.json({ success: false, error: 'Staff account not found' }, { status: 404 });
    }
    if (String(normalizedExistingRow.role ?? '').toLowerCase() !== 'staff') {
      return badRequest('Only staff accounts can be deactivated');
    }

    let deactivateResult = await supabase
      .from('users')
      .update({ is_active: false })
      .eq('id', id)
      .select('id, name, email, role, is_active, created_at')
      .single();

    if (deactivateResult.error && isUsersMissingColumnError(deactivateResult.error, 'is_active')) {
      return badRequest('users.is_active column is required to deactivate staff. Run db/migrations/2026-02-28_add_users_is_active.sql.');
    }

    if (deactivateResult.error) {
      const fkResponse = foreignKeyDeleteResponse(deactivateResult.error);
      if (fkResponse) return fkResponse;
      throw deactivateResult.error;
    }
    const normalizedAfterRow = normalizeUserRow(deactivateResult.data as Record<string, unknown>);
    const normalizedBeforeRow = normalizeUserRow(normalizedExistingRow);

    await writeAuditEvent({
      req,
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      actorRole: auth.role,
      action: 'staff.deactivate',
      resource: 'users',
      resourceId: id,
      outcome: 'success',
      before: normalizedBeforeRow,
      after: normalizedAfterRow ?? { ...normalizedBeforeRow, is_active: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isUsersTableMissingError(error)) return usersTableMissingResponse();
    return serverError(error, req);
  }
}
