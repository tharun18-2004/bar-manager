import { NextRequest, NextResponse } from 'next/server';
import { createClient, User } from '@supabase/supabase-js';

export type AppRole = 'staff' | 'manager' | 'owner';

interface AuthContext {
  user: User;
  role: AppRole;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const isAuthTestMode = process.env.AUTH_TEST_MODE === '1';

function resolveRole(user: User): AppRole {
  const appRole = user.app_metadata?.role;
  const userRole = user.user_metadata?.role;
  const rawRole = typeof appRole === 'string' ? appRole : typeof userRole === 'string' ? userRole : 'staff';
  return rawRole === 'owner' || rawRole === 'manager' ? rawRole : 'staff';
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
  if (token === 'test-manager') return 'manager';
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

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ success: false, error: 'Server auth is not configured' }, { status: 500 });
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) {
    return unauthorized('Invalid or expired token');
  }

  const role = resolveRole(data.user);
  if (allowedRoles && !allowedRoles.includes(role)) {
    return forbidden();
  }

  return { user: data.user, role };
}
