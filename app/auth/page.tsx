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
    <div className="flex h-screen bg-black text-white">
      <div className="w-1/2 bg-gradient-to-br from-blue-600 to-blue-900 flex flex-col items-center justify-center p-8">
        <h1 className="text-5xl font-black text-white mb-4">BAR-LOGIC</h1>
        <p className="text-xl text-blue-100 text-center">Professional Bar Management System</p>
      </div>

      <div className="w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <h2 className="text-3xl font-bold mb-8">{isLogin ? 'Sign In' : 'Create Account'}</h2>

          {isLogin && (
            <div className="mb-6">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setLoginMode('staff')}
                  className={`py-2 rounded-lg font-bold transition ${
                    loginMode === 'staff'
                      ? 'bg-white text-black'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  Staff Login
                </button>
                <button
                  type="button"
                  onClick={() => setLoginMode('owner')}
                  className={`py-2 rounded-lg font-bold transition ${
                    loginMode === 'owner'
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  Owner Login
                </button>
              </div>
              <p className="mt-3 text-xs text-zinc-500">
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
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                required={!isLogin}
              />
            )}

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              required
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              required
            />

            {error && <p className="text-red-500 text-sm">{error}</p>}
            {success && <p className="text-green-500 text-sm">{success}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 py-3 rounded-lg font-bold transition"
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
            <p className="text-zinc-400">
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="text-blue-400 hover:text-blue-300 font-bold transition"
              >
                {isLogin ? 'Sign Up' : 'Sign In'}
              </button>
            </p>
          </div>

          <div className="mt-8 pt-8 border-t border-zinc-700">
            <p className="text-zinc-500 text-sm text-center mb-4">Demo Credentials</p>
            <div className="space-y-2 text-xs text-zinc-600">
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
    <Suspense fallback={<div className="min-h-screen bg-black text-white flex items-center justify-center">Loading...</div>}>
      <AuthPageContent />
    </Suspense>
  );
}
