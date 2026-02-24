'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 p-4">
      <div className="w-full max-w-md bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl text-center">
        <h1 className="text-4xl font-black text-amber-400 mb-2">BAR-LOGIC</h1>
        <p className="text-slate-400 mb-8 uppercase tracking-widest text-xs">Management Suite</p>
        <div className="grid grid-cols-1 gap-4">
          <button 
            onClick={() => router.push('/auth?next=/employee')}
            className="w-full bg-white text-black font-bold py-4 rounded-xl hover:bg-zinc-200 transition"
          >
            STAFF SIGN IN
          </button>
          <button
            onClick={() => router.push('/auth?next=/owner')}
            className="w-full bg-amber-500 text-white font-bold py-4 rounded-xl hover:bg-amber-400 transition"
          >
            OWNER SIGN IN
          </button>
        </div>
      </div>
    </div>
  );
}
