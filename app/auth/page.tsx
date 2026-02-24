'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getCurrentUser, signIn, signUp } from '@/lib/auth';
import { Suspense } from 'react';

function resolveNextPath(nextValue: string | null): string {
  if (!nextValue) return '/employee';
  if (!nextValue.startsWith('/')) return '/employee';
  if (nextValue.startsWith('//')) return '/employee';
  return nextValue;
}

type LoginMode = 'staff' | 'owner';

function resolveRole(rawRole: unknown): 'staff' | 'manager' | 'owner' {
  if (rawRole === 'owner' || rawRole === 'manager') return rawRole;
  return 'staff';
}

function defaultPathForRole(role: 'staff' | 'manager' | 'owner') {
  return role === 'owner' ? '/owner' : '/employee';
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
        const selectedPath = loginMode === 'owner' ? '/owner' : '/employee';
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
          router.push('/owner');
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
      setError(String(err).split(':')[1]?.trim() || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white grid grid-cols-1 lg:grid-cols-2">
      <div className="flex bg-gradient-to-br from-amber-500 via-amber-600 to-orange-700 flex-col items-center justify-center p-8 lg:p-10 min-h-56 lg:min-h-screen">
        <h1 className="text-5xl lg:text-6xl font-black text-slate-950 mb-3 tracking-tight">BAR-LOGIC</h1>
        <p className="text-lg lg:text-2xl text-amber-100 text-center max-w-md">Professional Bar Management System</p>
        <div className="mt-6 lg:mt-10 rounded-2xl bg-slate-950/20 border border-black/20 px-6 py-4 text-amber-50 text-sm">
          Built for staff speed, owner visibility, and operational control.
        </div>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-10 -mt-8 lg:mt-0">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 lg:p-8 shadow-2xl">
          <h2 className="text-3xl font-black mb-8 text-amber-400">{isLogin ? 'Sign In' : 'Create Account'}</h2>

          {isLogin && (
            <div className="mb-6">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setLoginMode('staff')}
                    className={`py-2 rounded-lg font-bold transition ${
                    loginMode === 'staff'
                      ? 'bg-amber-400 text-slate-900'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Staff Login
                </button>
                <button
                  type="button"
                  onClick={() => setLoginMode('owner')}
                    className={`py-2 rounded-lg font-bold transition ${
                    loginMode === 'owner'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Owner Login
                </button>
              </div>
              <p className="mt-3 text-xs text-slate-400">
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
                className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
                required={!isLogin}
              />
            )}

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
              required
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
              required
            />

            {error && <p className="text-rose-400 text-sm">{error}</p>}
            {success && <p className="text-emerald-400 text-sm">{success}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:bg-slate-700 disabled:text-slate-300 py-3 rounded-lg font-bold transition"
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
            <p className="text-slate-300">
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="text-amber-300 hover:text-amber-200 font-bold transition"
              >
                {isLogin ? 'Sign Up' : 'Sign In'}
              </button>
            </p>
          </div>

          <div className="mt-8 pt-8 border-t border-slate-700">
            <p className="text-slate-400 text-sm text-center mb-4">Demo Credentials</p>
            <div className="space-y-2 text-xs text-slate-500">
              <p>Email: demo@bar.com</p>
              <p>Password: Demo@123</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Loading...</div>}>
      <AuthPageContent />
    </Suspense>
  );
}
