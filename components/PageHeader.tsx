'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AppRole } from '@/lib/api-auth';
import { signOut } from '@/lib/auth';

type PageHeaderProps = {
  title: string;
  role?: AppRole | null;
};

export default function PageHeader({ title, role }: PageHeaderProps) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const onSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      router.replace('/auth');
      setIsSigningOut(false);
    }
  };

  return (
    <div className="bg-slate-900/95 border-b border-slate-800 px-6 py-5 flex justify-between items-center backdrop-blur">
      <h1 className="text-3xl font-black text-amber-400 tracking-tight">{title}</h1>
      <div className="flex items-center gap-3">
        {role && (
          <span className="px-3 py-1 rounded-full border border-slate-700 bg-slate-800 text-xs font-bold uppercase text-slate-200">
            Role: {role}
          </span>
        )}
        <button
          onClick={onSignOut}
          disabled={isSigningOut}
          className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-700 rounded-lg font-semibold transition"
        >
          {isSigningOut ? 'Signing Out...' : 'Sign Out'}
        </button>
      </div>
    </div>
  );
}
