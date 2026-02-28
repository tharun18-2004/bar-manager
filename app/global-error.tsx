'use client';

import { useEffect } from 'react';

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error('Global error boundary caught an error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-900 p-6">
          <div className="max-w-md w-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold mb-2">Application error</h2>
            <p className="text-sm text-slate-600 mb-4">
              A critical error occurred. Please try reloading.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700"
            >
              Reload app
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

