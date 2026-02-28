'use client';

import { useEffect } from 'react';

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('Route error boundary caught an error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-900 p-6">
      <div className="max-w-md w-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
        <p className="text-sm text-slate-600 mb-4">
          An unexpected error occurred while loading this page.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

