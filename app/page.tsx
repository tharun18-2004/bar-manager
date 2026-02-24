'use client';

import React from 'react';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 p-4">
      <div className="w-full max-w-md bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl text-center">
        <h1 className="text-4xl font-black text-amber-400 mb-2">BAR-LOGIC</h1>
        <p className="text-slate-400 mb-8 uppercase tracking-widest text-xs">Management Suite</p>
        <div className="grid grid-cols-1 gap-4">
          <Link
            href="/auth?next=/employee"
            className="block w-full bg-white text-black font-bold py-4 rounded-xl hover:bg-zinc-200 transition"
          >
            STAFF SIGN IN
          </Link>
          <Link
            href="/auth?next=/owner"
            className="block w-full bg-amber-500 text-white font-bold py-4 rounded-xl hover:bg-amber-400 transition"
          >
            OWNER SIGN IN
          </Link>
        </div>
      </div>
    </div>
  );
}
