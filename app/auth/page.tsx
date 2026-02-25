'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getCurrentUser, signIn, signUp } from '@/lib/auth';
import { Suspense } from 'react';

function resolveNextPath(nextValue: string | null): string {
  if (!nextValue) return '/dashboard';
  if (!nextValue.startsWith('/')) return '/dashboard';
  if (nextValue.startsWith('//')) return '/dashboard';
  return nextValue;
}

type LoginMode = 'staff' | 'owner';

function resolveRole(rawRole: unknown): 'staff' | 'manager' | 'owner' {
  if (rawRole === 'owner' || rawRole === 'manager') return rawRole;
  return 'staff';
}

function defaultPathForRole(role: 'staff' | 'manager' | 'owner') {
  return '/dashboard';
}

function AuthPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loginMode, setLoginMode] = useState<LoginMode>('staff');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) throw error;

        const user = await getCurrentUser();
        const appRole = resolveRole(user?.app_metadata?.role);
        const profileRole = resolveRole(user?.user_metadata?.role);
        const effectiveRole = appRole === 'owner' || profileRole === 'owner' ? 'owner' : appRole;

        const requestedNext = searchParams.get('next');
        const selectedPath = '/dashboard';
        const nextPath = requestedNext
          ? resolveNextPath(requestedNext)
          : selectedPath === defaultPathForRole(effectiveRole)
            ? selectedPath
            : defaultPathForRole(effectiveRole);

        if (loginMode === 'owner' && effectiveRole !== 'owner') {
          router.push(defaultPathForRole(effectiveRole));
          return;
        }

        if (loginMode === 'staff' && effectiveRole === 'owner') {
          router.push('/dashboard');
          return;
        }

        router.push(nextPath);
      } else {
        const { error } = await signUp(email, password, fullName);
        if (error) throw error;
        setSuccess('Account created. Please sign in.');
        setIsLogin(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes('failed to fetch')) {
        setError('Cannot reach authentication server. Check Supabase URL/key in Vercel env and redeploy.');
      } else {
        setError(message || 'Authentication failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 grid grid-cols-1 lg:grid-cols-2">
      <div className="relative flex bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-600 flex-col items-start justify-end p-8 lg:p-12 min-h-56 lg:min-h-screen overflow-hidden">
        <div className="absolute -top-20 -left-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-24 -right-20 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" />
        <h1 className="relative text-5xl lg:text-6xl font-black text-white mb-3 tracking-tight">BAR-LOGIC</h1>
        <p className="relative text-lg lg:text-2xl text-blue-50 max-w-md">Professional Bar Management System</p>
        <div className="relative mt-6 lg:mt-10 rounded-2xl bg-white/15 border border-white/30 px-6 py-4 text-blue-50 text-sm">
          Built for staff speed, owner visibility, and operational control.
        </div>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 lg:p-8 shadow-sm">
          <h2 className="text-3xl font-black mb-8 text-slate-900">{isLogin ? 'Sign In' : 'Create Account'}</h2>

          {isLogin && (
            <div className="mb-6">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setLoginMode('staff')}
                  className={`py-2 rounded-xl font-bold transition ${
                    loginMode === 'staff'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Staff Login
                </button>
                <button
                  type="button"
                  onClick={() => setLoginMode('owner')}
                  className={`py-2 rounded-xl font-bold transition ${
                    loginMode === 'owner'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Owner Login
                </button>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                You will be redirected to your allowed dashboard based on account role.
              </p>
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            {!isLogin && (
              <input
                type="text"
                placeholder="Full Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
                required={!isLogin}
              />
            )}

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
              required
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
              required
            />

            {error && <p className="text-rose-400 text-sm">{error}</p>}
            {success && <p className="text-emerald-400 text-sm">{success}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white disabled:bg-slate-300 disabled:text-slate-600 py-3 rounded-xl font-bold transition"
            >
              {loading
                ? 'Processing...'
                : isLogin
                  ? loginMode === 'owner'
                    ? 'Sign In as Owner'
                    : 'Sign In as Staff'
                  : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-slate-600">
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="text-blue-600 hover:text-blue-500 font-bold transition"
              >
                {isLogin ? 'Sign Up' : 'Sign In'}
              </button>
            </p>
          </div>

        </div>
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
