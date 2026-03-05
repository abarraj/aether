// Hook to detect the available date range in the org's metric data.
// Used by the dashboard to show the detected date range and constrain
// the date picker.
'use client';

import { useEffect, useState } from 'react';

import { getDataRange } from '@/lib/data/metric-aggregator';

interface UseDataRangeState {
  dataRange: { min: string; max: string } | null;
  isLoading: boolean;
}

export function useDataRange(orgId: string | null, refreshKey = 0): UseDataRangeState {
  const [state, setState] = useState<UseDataRangeState>({
    dataRange: null,
    isLoading: false,
  });

  useEffect(() => {
    if (!orgId) return;

    let cancelled = false;

    setState((prev) => ({ ...prev, isLoading: true }));

    getDataRange(orgId)
      .then((range) => {
        if (!cancelled) {
          setState({ dataRange: range, isLoading: false });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ dataRange: null, isLoading: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [orgId, refreshKey]);

  return state;
}
