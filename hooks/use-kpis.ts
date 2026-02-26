// Hook to fetch KPI summary and time series for the current organization.
'use client';

import { useEffect, useState } from 'react';

import { useOrg } from '@/hooks/use-org';
import type { DateRange, KPIData, Period } from '@/lib/data/aggregator';
import { getKPIs } from '@/lib/data/aggregator';

interface UseKpisState {
  kpis: KPIData | null;
  isLoading: boolean;
  error: string | null;
}

export function useKpis(
  period: Period,
  dateRange: DateRange,
  refreshKey = 0,
): UseKpisState {
  const { org, isLoading: isOrgLoading } = useOrg();

  const [state, setState] = useState<UseKpisState>({
    kpis: null,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!org) return;

      setState((previous) => ({ ...previous, isLoading: true, error: null }));

      try {
        const data = await getKPIs(org.id, period, dateRange);
        if (!cancelled) {
          setState({
            kpis: data,
            isLoading: false,
            error: null,
          });
        }
      } catch {
        if (!cancelled) {
          setState({
            kpis: null,
            isLoading: false,
            error: 'Failed to load KPIs.',
          });
        }
      }
    };

    if (!isOrgLoading && org) {
      void run();
    }

    return () => {
      cancelled = true;
    };
  }, [org, isOrgLoading, period, dateRange.start, dateRange.end, refreshKey]);

  return state;
}

