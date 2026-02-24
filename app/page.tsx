'use client';

import React from 'react';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 p-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl border border-slate-200 shadow-sm text-center">
        <h1 className="text-4xl font-black text-slate-900 mb-2">BAR-LOGIC</h1>
        <p className="text-slate-500 mb-8 uppercase tracking-widest text-xs">Management Suite</p>
        <div className="grid grid-cols-1 gap-4">
          <Link
            href="/auth?next=/dashboard"
            className="block w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-500 transition"
          >
            STAFF SIGN IN
          </Link>
          <Link
            href="/auth?next=/dashboard"
            className="block w-full bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-slate-700 transition"
          >
            OWNER SIGN IN
          </Link>
        </div>
      </div>
    </div>
  );
}
