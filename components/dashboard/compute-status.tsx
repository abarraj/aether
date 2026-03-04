// Compute status badge showing "Computing..." or "Last computed X ago".
// Appears in the dashboard header to signal data freshness.
'use client';

import { useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface ComputeStatusProps {
  isComputing: boolean;
  lastComputedAt: string | null;
  error: string | null;
}

export function ComputeStatus({ isComputing, lastComputedAt, error }: ComputeStatusProps) {
  const label = useMemo(() => {
    if (isComputing) return 'Computing...';
    if (error) return 'Compute failed';
    if (lastComputedAt) {
      try {
        return `Updated ${formatDistanceToNow(new Date(lastComputedAt), { addSuffix: true })}`;
      } catch {
        return 'Updated recently';
      }
    }
    return null;
  }, [isComputing, lastComputedAt, error]);

  if (!label) return null;

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium"
      title={error ?? (lastComputedAt ? `Computed at ${lastComputedAt}` : undefined)}
    >
      {isComputing && (
        <>
          <Loader2 className="h-3 w-3 animate-spin text-emerald-400" />
          <span className="text-emerald-400">{label}</span>
        </>
      )}
      {!isComputing && error && (
        <>
          <AlertCircle className="h-3 w-3 text-rose-400" />
          <span className="text-rose-400">{label}</span>
        </>
      )}
      {!isComputing && !error && lastComputedAt && (
        <>
          <CheckCircle2 className="h-3 w-3 text-slate-600" />
          <span className="text-slate-600">{label}</span>
        </>
      )}
    </div>
  );
}
