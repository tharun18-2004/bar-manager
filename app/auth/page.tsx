'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  getCurrentUser,
  getSession,
  sendPasswordReset,
  signIn,
  updatePassword,
} from '@/lib/auth';

type LoginMode = 'staff' | 'owner';
type AuthView = 'password' | 'forgot' | 'reset';

function resolveLoginMode(rawMode: string | null): LoginMode {
  return rawMode === 'owner' ? 'owner' : 'staff';
}

function resolveNextPath(nextValue: string | null): string {
  if (!nextValue || !nextValue.startsWith('/') || nextValue.startsWith('//')) return '/dashboard';
  return nextValue;
}

function resolveRole(rawRole: unknown): 'staff' | 'owner' {
  if (rawRole === 'owner' ) return rawRole;
  return 'staff';
}

async function resolveEffectiveRoleFromServer(accessToken: string): Promise<'staff' | 'owner' | 'inactive' | null> {
  try {
    const response = await fetch('/api/auth-context', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-request-id': crypto.randomUUID(),
      },
    });
    if (response.status === 403) return 'inactive';
    if (!response.ok) return null;
    const payload = await response.json();
    const role = payload?.data?.role;
    return role === 'owner'  || role === 'staff' ? role : null;
  } catch {
    return null;
  }
}

function authConnectivityHint() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!url) return 'NEXT_PUBLIC_SUPABASE_URL is missing in deployment env.';
  if (!url.startsWith('https://')) return `NEXT_PUBLIC_SUPABASE_URL must start with https:// (current: ${url}).`;
  return 'Could not reach Supabase Auth. Check project status and anon key.';
}

function AuthPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedLoginMode = resolveLoginMode(searchParams.get('role'));

  const [view, setView] = useState<AuthView>('password');
  const [loginMode, setLoginMode] = useState<LoginMode>('staff');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const toggleButtonClass = (active: boolean) =>
    `absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-md border px-2 py-1 text-xs font-semibold shadow-sm transition ${
      active
        ? 'border-blue-500 bg-blue-600 text-white'
        : 'border-slate-500 bg-slate-800 text-slate-100 hover:border-slate-300 hover:bg-slate-700'
    }`;

  useEffect(() => {
    setLoginMode(requestedLoginMode);
  }, [requestedLoginMode]);

  useEffect(() => {
    if (searchParams.get('mode') === 'reset') {
      setView('reset');
      return;
    }
    void (async () => {
      const session = await getSession();
      if (!session?.access_token) return;
      const roleFromServer = await resolveEffectiveRoleFromServer(session.access_token);
      if (roleFromServer === 'inactive') return;
      const user = await getCurrentUser();
      const metadataRole = resolveRole(user?.app_metadata?.role ?? user?.user_metadata?.role);
      const effectiveRole = roleFromServer ?? metadataRole;
      if (loginMode === 'owner' && effectiveRole !== 'owner') return;
      const nextPath = resolveNextPath(searchParams.get('next'));
      router.replace(nextPath);
    })();
  }, [loginMode, router, searchParams]);

  async function routeAfterAuth() {
    const user = await getCurrentUser();
    const session = await getSession();
    const metadataRole = resolveRole(user?.app_metadata?.role ?? user?.user_metadata?.role);
    const serverRole = session?.access_token ? await resolveEffectiveRoleFromServer(session.access_token) : null;
    if (serverRole === 'inactive') {
      throw new Error('This account is inactive. Contact the owner.');
    }
    const effectiveRole = serverRole ?? metadataRole;

    if (loginMode === 'owner' && effectiveRole !== 'owner') {
      throw new Error('This account is not an owner account. Use Staff login.');
    }
    if (loginMode === 'staff' && effectiveRole === 'owner') {
      throw new Error('Owner account detected. Please use Owner login.');
    }

    const requestedNext = searchParams.get('next');
    router.push(resolveNextPath(requestedNext));
  }

  function mapError(err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes('failed to fetch')) {
      return `Cannot reach authentication server. ${authConnectivityHint()}`;
    }
    return message || 'Authentication failed';
  }

  async function handlePasswordAuth(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const { error: signInError } = await signIn(email, password);
      if (signInError) throw signInError;
      await routeAfterAuth();
    } catch (err) {
      setError(mapError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const { error: resetError } = await sendPasswordReset(email);
      if (resetError) throw resetError;
      setSuccess('Password reset email sent.');
    } catch (err) {
      setError(mapError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordUpdate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      if (newPassword.length < 6) throw new Error('Password must be at least 6 characters.');
      if (newPassword !== confirmPassword) throw new Error('Passwords do not match.');
      const { error: updateError } = await updatePassword(newPassword);
      if (updateError) throw updateError;
      const resetUser = await getCurrentUser();
      const resetEmail = typeof resetUser?.email === 'string' ? resetUser.email : '';
      if (resetEmail) {
        const { error: signInError } = await signIn(resetEmail, newPassword);
        if (signInError) throw signInError;
        setSuccess('Password updated. Redirecting...');
        await routeAfterAuth();
        return;
      }
      setSuccess('Password updated. Please sign in.');
      setView('password');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(mapError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#0b1220,_#111827_48%,_#0a0f1a)] text-slate-100 px-4 py-8">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
        <section className="flex flex-col justify-between rounded-3xl border border-slate-400/20 bg-gradient-to-br from-blue-500/15 via-slate-800/50 to-slate-900/60 p-8 shadow-2xl shadow-black/30 backdrop-blur-md">
          <div>
            <div className="inline-flex items-center gap-3 rounded-2xl border border-blue-300/30 bg-slate-900/50 px-3 py-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-black text-white">BL</span>
              <p className="text-sm font-bold tracking-wide text-blue-100">BarLogic POS</p>
            </div>
            <h1 className="mt-5 text-4xl font-black leading-tight">Modern POS for Bars and Restaurants</h1>
            <p className="mt-4 max-w-md text-slate-200/90">
              Manage tables, orders, inventory, and sales analytics in one platform.
            </p>
          </div>
          <div className="mt-8 rounded-2xl border border-slate-500/30 bg-slate-900/40 p-4 text-sm text-slate-200">
            <p className="font-semibold text-blue-100">Role-based access control</p>
            <p className="mt-1">Staff handles POS operations. Owner manages analytics, inventory, and reports.</p>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-400/20 bg-slate-900/60 p-6 shadow-2xl shadow-black/40 backdrop-blur-md sm:p-8">
          <div className="mb-4">
            <h2 className="text-2xl font-black text-slate-100">Sign In</h2>
            <p className="text-sm text-slate-300">Secure access for your workspace</p>
          </div>
          <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-900 p-1">
            <button
              type="button"
              onClick={() => setLoginMode('staff')}
              className={`rounded-lg py-2 text-sm font-bold transition ${loginMode === 'staff' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
            >
              Staff
            </button>
            <button
              type="button"
              onClick={() => setLoginMode('owner')}
              className={`rounded-lg py-2 text-sm font-bold transition ${loginMode === 'owner' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
            >
              Owner
            </button>
          </div>

          {view === 'password' && (
            <form onSubmit={handlePasswordAuth} className="space-y-3">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-600 bg-slate-900/70 px-3 py-2 outline-none focus:border-blue-400"
              />
              <div className="relative">
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-600 bg-slate-900/70 px-3 py-2 pr-20 outline-none focus:border-blue-400"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((prev) => !prev)}
                  className={toggleButtonClass(showLoginPassword)}
                >
                  {showLoginPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-2 font-black text-white transition hover:from-blue-500 hover:to-blue-600 disabled:opacity-60"
              >
                {loading ? 'Processing...' : 'Sign In'}
              </button>
              <button
                type="button"
                onClick={() => setView('forgot')}
                className="w-full text-sm font-semibold text-blue-300 hover:text-blue-200"
              >
                Forgot Password?
              </button>
            </form>
          )}

          {view === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-3">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-600 bg-slate-900/70 px-3 py-2 outline-none focus:border-blue-400"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-2 font-black text-white transition hover:from-blue-500 hover:to-blue-600 disabled:opacity-60"
              >
                {loading ? 'Sending...' : 'Send Reset Email'}
              </button>
              <button
                type="button"
                onClick={() => setView('password')}
                className="w-full text-sm font-semibold text-slate-300 hover:text-white"
              >
                Back to Login
              </button>
            </form>
          )}

          {view === 'reset' && (
            <form onSubmit={handlePasswordUpdate} className="space-y-3">
              <div className="relative">
                <input
                  type={showResetPassword ? 'text' : 'password'}
                  placeholder="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-600 bg-slate-900/70 px-3 py-2 pr-20 outline-none focus:border-blue-400"
                />
                <button
                  type="button"
                  onClick={() => setShowResetPassword((prev) => !prev)}
                  className={toggleButtonClass(showResetPassword)}
                >
                  {showResetPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <div className="relative">
                <input
                  type={showResetConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-600 bg-slate-900/70 px-3 py-2 pr-20 outline-none focus:border-blue-400"
                />
                <button
                  type="button"
                  onClick={() => setShowResetConfirmPassword((prev) => !prev)}
                  className={toggleButtonClass(showResetConfirmPassword)}
                >
                  {showResetConfirmPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-2 font-black text-white transition hover:from-blue-500 hover:to-blue-600 disabled:opacity-60"
              >
                {loading ? 'Updating...' : 'Update Password'}
              </button>
              <button
                type="button"
                onClick={() => setView('password')}
                className="w-full text-sm font-semibold text-slate-300 hover:text-white"
              >
                Back to Login
              </button>
            </form>
          )}

          {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
          {success && <p className="mt-4 text-sm text-emerald-300">{success}</p>}
          <div className="mt-4 text-center text-xs text-slate-400">
            <p>Powered by BarLogic Technologies</p>
            <p className="mt-1">© 2026 All rights reserved</p>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-100 text-slate-700 flex items-center justify-center">Loading...</div>}>
      <AuthPageContent />
    </Suspense>
  );
}


