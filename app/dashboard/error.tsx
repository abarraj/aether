'use client';

import { useEffect } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10">
          <span className="text-2xl">⚠</span>
        </div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-100">
          Something went wrong
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          An unexpected error occurred. Your data is safe.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-medium text-slate-950 hover:bg-emerald-600 transition"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
