// Hook to poll the latest compute run status for the current org.
// Dashboard uses this to show "Computing..." spinner or "Last computed X ago".
'use client';

import { useEffect, useState, useCallback } from 'react';

interface ComputeRun {
  id: string;
  status: string;
  trigger: string;
  metrics_computed: number | null;
  rows_processed: number | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
}

interface UseComputeStatusState {
  run: ComputeRun | null;
  isComputing: boolean;
  lastComputedAt: string | null;
  error: string | null;
}

export function useComputeStatus(orgId: string | null, pollInterval = 5000): UseComputeStatusState {
  const [state, setState] = useState<UseComputeStatusState>({
    run: null,
    isComputing: false,
    lastComputedAt: null,
    error: null,
  });

  const fetchStatus = useCallback(async () => {
    if (!orgId) return;

    try {
      const res = await fetch('/api/compute/status');
      if (!res.ok) return;

      const data = (await res.json()) as { run: ComputeRun | null };
      const run = data.run;

      setState({
        run,
        isComputing: run?.status === 'running' || run?.status === 'pending',
        lastComputedAt: run?.status === 'completed' ? run.finished_at : null,
        error: run?.status === 'failed' ? run.error_message : null,
      });
    } catch {
      // Silently fail — non-critical
    }
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;

    // Initial fetch
    void fetchStatus();

    // Poll while computing, less often when idle
    const interval = setInterval(fetchStatus, pollInterval);

    return () => clearInterval(interval);
  }, [orgId, pollInterval, fetchStatus]);

  return state;
}
