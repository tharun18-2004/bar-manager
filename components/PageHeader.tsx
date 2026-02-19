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
    <div className="bg-zinc-900 border-b border-zinc-800 p-6 flex justify-between items-center">
      <h1 className="text-3xl font-bold text-blue-500">{title}</h1>
      <div className="flex items-center gap-3">
        {role && (
          <span className="px-3 py-1 rounded-full border border-zinc-700 bg-zinc-800 text-xs font-bold uppercase text-zinc-300">
            Role: {role}
          </span>
        )}
        <button
          onClick={onSignOut}
          disabled={isSigningOut}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 rounded-lg font-semibold transition"
        >
          {isSigningOut ? 'Signing Out...' : 'Sign Out'}
        </button>
      </div>
    </div>
  );
}
