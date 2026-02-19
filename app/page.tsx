'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black p-4">
      <div className="w-full max-w-md bg-zinc-900 p-8 rounded-2xl border border-zinc-800 shadow-2xl text-center">
        <h1 className="text-4xl font-black text-blue-500 mb-2">BAR-LOGIC</h1>
        <p className="text-zinc-500 mb-8 uppercase tracking-widest text-xs">Management Suite</p>
        <div className="grid grid-cols-1 gap-4">
          <button 
            onClick={() => router.push('/auth?next=/employee')}
            className="w-full bg-white text-black font-bold py-4 rounded-xl hover:bg-zinc-200 transition"
          >
            STAFF SIGN IN
          </button>
          <button
            onClick={() => router.push('/auth?next=/owner')}
            className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition"
          >
            OWNER SIGN IN
          </button>
        </div>
      </div>
    </div>
  );
}
