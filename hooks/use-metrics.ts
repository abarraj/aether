// Hook to fetch metric summary and time series for the current organization.
// Replaces use-kpis.ts with metric_snapshots-backed data (with legacy fallback).
'use client';

import { useEffect, useState } from 'react';

import type { DateRange, MetricData, Period } from '@/lib/data/metric-aggregator';
import { getMetrics } from '@/lib/data/metric-aggregator';

interface UseMetricsState {
  metrics: MetricData | null;
  isLoading: boolean;
  error: string | null;
}

export function useMetrics(
  period: Period,
  dateRange: DateRange,
  refreshKey = 0,
  orgIds: string[] = [],
): UseMetricsState {
  const [state, setState] = useState<UseMetricsState>({
    metrics: null,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (orgIds.length === 0) return;

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const results = await Promise.all(
          orgIds.map((id) => getMetrics(id, period, dateRange)),
        );

        const data: MetricData = {
          revenue: results.reduce((sum, r) => sum + r.revenue, 0),
          laborCost: results.reduce((sum, r) => sum + r.laborCost, 0),
          laborHours: results.reduce((sum, r) => sum + r.laborHours, 0),
          attendance: results.reduce((sum, r) => sum + r.attendance, 0),
          utilization:
            results.length > 0
              ? results.reduce((sum, r) => sum + r.utilization, 0) / results.length
              : 0,
          staffCostRatio: results[0]?.staffCostRatio ?? null,
          forecast:
            results.reduce((sum, r) => sum + (r.forecast ?? 0), 0) || null,
          changes: {
            revenuePct: results[0]?.changes.revenuePct ?? null,
            laborCostPct: results[0]?.changes.laborCostPct ?? null,
            utilizationPct: results[0]?.changes.utilizationPct ?? null,
          },
          series: results[0]?.series ?? [],
          computedAt: results[0]?.computedAt ?? null,
          datasetVersion: results[0]?.datasetVersion ?? null,
        };

        if (!cancelled) {
          setState({ metrics: data, isLoading: false, error: null });
        }
      } catch {
        if (!cancelled) {
          setState({ metrics: null, isLoading: false, error: 'Failed to load metrics.' });
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
