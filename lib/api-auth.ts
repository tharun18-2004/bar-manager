import { NextRequest, NextResponse } from 'next/server';
import { createClient, User } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase';

export type AppRole = 'staff' | 'owner';

interface AuthContext {
  user: User;
  role: AppRole;
}

interface UserAccessRow {
  role: AppRole;
  isActive: boolean;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const isAuthTestMode = process.env.AUTH_TEST_MODE === '1';

function resolveRole(user: User): AppRole {
  const appRole = user.app_metadata?.role;
  const userRole = user.user_metadata?.role;
  const rawRole = typeof appRole === 'string' ? appRole : typeof userRole === 'string' ? userRole : 'staff';
  return rawRole === 'owner' ? 'owner' : 'staff';
}

async function resolveUserAccessFromUsersTable(userId: string): Promise<UserAccessRow | null> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('role, is_active')
      .eq('id', userId)
      .limit(1)
      .maybeSingle();
    if (error) {
      const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
      if (!message.includes("column 'is_active' does not exist") && !message.includes('column "is_active" does not exist')) {
        return null;
      }

      const fallback = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .limit(1)
        .maybeSingle();
      if (fallback.error || !fallback.data) return null;
      const fallbackRole = typeof fallback.data.role === 'string' ? fallback.data.role.trim().toLowerCase() : '';
      if (fallbackRole === 'owner') return { role: 'owner', isActive: true };
      if (fallbackRole === 'staff') return { role: 'staff', isActive: true };
      return null;
    }
    if (!data) return null;
    const dbRole = typeof data.role === 'string' ? data.role.trim().toLowerCase() : '';
    const isActive = data.is_active !== false;
    if (dbRole === 'owner') return { role: 'owner', isActive };
    if (dbRole === 'staff') return { role: 'staff', isActive };
    return null;
  } catch {
    return null;
  }
}

function unauthorized(message: string) {
  return NextResponse.json({ success: false, error: message }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
}

function resolveTestRoleFromToken(token: string): AppRole | null {
  if (!isAuthTestMode) return null;

  if (token === 'test-owner') return 'owner';
  if (token === 'test-staff') return 'staff';
  return null;
}

function testAuthContext(role: AppRole): AuthContext {
  return {
    role,
    user: {
      id: `test-${role}`,
      email: `${role}@example.test`,
      aud: 'authenticated',
      app_metadata: { role },
      user_metadata: { role },
      created_at: new Date().toISOString(),
    } as User,
  };
}

export async function requireAuth(
  req: NextRequest,
  allowedRoles?: AppRole[]
): Promise<AuthContext | NextResponse> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return unauthorized('Missing bearer token');
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return unauthorized('Invalid bearer token');
  }

  const testRole = resolveTestRoleFromToken(token);
  if (testRole) {
    if (allowedRoles && !allowedRoles.includes(testRole)) {
      return forbidden();
    }
    return testAuthContext(testRole);
  }

  const authKey = (supabaseServiceRoleKey && supabaseServiceRoleKey.trim()) || (supabaseAnonKey && supabaseAnonKey.trim());
  if (!supabaseUrl || !authKey) {
    return NextResponse.json({ success: false, error: 'Server auth is not configured' }, { status: 500 });
  }

  const authClient = createClient(supabaseUrl, authKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) {
    return unauthorized('Invalid or expired token');
  }

  const metadataRole = resolveRole(data.user);
  const dbAccess = await resolveUserAccessFromUsersTable(data.user.id);
  if (dbAccess && !dbAccess.isActive) {
    return forbidden();
  }
  const role = dbAccess?.role ?? metadataRole;
  if (allowedRoles && !allowedRoles.includes(role)) {
    return forbidden();
  }

  return { user: data.user, role };
}
