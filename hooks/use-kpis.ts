// Hook to fetch KPI summary and time series for the current organization.
'use client';

import { useEffect, useState } from 'react';

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
  orgIds: string[] = [],
): UseKpisState {
  const [state, setState] = useState<UseKpisState>({
    kpis: null,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (orgIds.length === 0) return;

      setState((previous) => ({ ...previous, isLoading: true, error: null }));

      try {
        const idsToQuery = orgIds;
        const results = await Promise.all(idsToQuery.map((id) => getKPIs(id, period, dateRange)));
        const data: KPIData = {
          revenue: results.reduce((sum, r) => sum + r.revenue, 0),
          laborCost: results.reduce((sum, r) => sum + r.laborCost, 0),
          utilization:
            results.length > 0
              ? results.reduce((sum, r) => sum + r.utilization, 0) / results.length
              : 0,
          forecast:
            results.reduce((sum, r) => sum + (r.forecast ?? 0), 0) || null,
          changes: {
            revenuePct: results[0]?.changes.revenuePct ?? null,
            laborCostPct: results[0]?.changes.laborCostPct ?? null,
            utilizationPct: results[0]?.changes.utilizationPct ?? null,
          },
          series: results[0]?.series ?? [],
        };
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

    if (orgIds.length > 0) {
      void run();
    }

    return () => {
      cancelled = true;
    };
  }, [period, dateRange.start, dateRange.end, refreshKey, JSON.stringify(orgIds)]);

  return state;
}

