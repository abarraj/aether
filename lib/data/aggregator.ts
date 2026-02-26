// Aggregates KPI snapshots into summary metrics and time series.

import { parseISO, subDays, differenceInCalendarDays, formatISO } from 'date-fns';

import { createClient } from '@/lib/supabase/client';

export type Period = 'daily' | 'weekly' | 'monthly';

export interface DateRange {
  start: string;
  end: string;
}

interface SnapshotRow {
  date: string;
  metrics: {
    revenue?: number | null;
    laborCost?: number | null;
    utilization?: number | null;
  };
}

export interface KPIChanges {
  revenuePct: number | null;
  laborCostPct: number | null;
  utilizationPct: number | null;
}

export interface KPIData {
  revenue: number;
  laborCost: number;
  utilization: number;
  forecast: number | null;
  changes: KPIChanges;
  series: {
    date: string;
    revenue: number | null;
    laborCost: number | null;
    utilization: number | null;
  }[];
}

function computeChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export async function getKPIs(
  orgId: string,
  period: Period,
  dateRange: DateRange,
): Promise<KPIData> {
  const supabase = createClient();

  const { data: currentSnapshots } = await supabase
    .from('kpi_snapshots')
    .select('date, metrics')
    .eq('org_id', orgId)
    .eq('period', period)
    .gte('date', dateRange.start)
    .lte('date', dateRange.end)
    .order('date', { ascending: true })
    .returns<SnapshotRow[]>();

  const startDate = parseISO(dateRange.start);
  const endDate = parseISO(dateRange.end);
  const lengthInDays = Math.max(differenceInCalendarDays(endDate, startDate) + 1, 1);

  const previousEnd = subDays(startDate, 1);
  const previousStart = subDays(previousEnd, lengthInDays - 1);

  const { data: previousSnapshots } = await supabase
    .from('kpi_snapshots')
    .select('date, metrics')
    .eq('org_id', orgId)
    .eq('period', period)
    .gte('date', formatISO(previousStart, { representation: 'date' }))
    .lte('date', formatISO(previousEnd, { representation: 'date' }))
    .returns<SnapshotRow[]>();

  const sumMetrics = (snapshots: SnapshotRow[]) => {
    return snapshots.reduce(
      (accumulator, snapshot) => ({
        revenue: accumulator.revenue + (snapshot.metrics.revenue ?? 0),
        laborCost: accumulator.laborCost + (snapshot.metrics.laborCost ?? 0),
        utilization: accumulator.utilization + (snapshot.metrics.utilization ?? 0),
      }),
      { revenue: 0, laborCost: 0, utilization: 0 },
    );
  };

  const currentTotals = sumMetrics(currentSnapshots ?? []);
  const previousTotals = sumMetrics(previousSnapshots ?? []);

  const revenueChange = computeChange(currentTotals.revenue, previousTotals.revenue);
  const laborCostChange = computeChange(currentTotals.laborCost, previousTotals.laborCost);
  const utilizationChange = computeChange(currentTotals.utilization, previousTotals.utilization);

  const series =
    currentSnapshots?.map((snapshot) => ({
      date: snapshot.date,
      revenue: snapshot.metrics.revenue ?? null,
      laborCost: snapshot.metrics.laborCost ?? null,
      utilization: snapshot.metrics.utilization ?? null,
    })) ?? [];

  const averageDailyRevenue =
    series.length > 0
      ? series.reduce((sum, point) => sum + (point.revenue ?? 0), 0) / series.length
      : 0;

  const forecast = averageDailyRevenue > 0 ? averageDailyRevenue * series.length : null;

  return {
    revenue: currentTotals.revenue,
    laborCost: currentTotals.laborCost,
    utilization: currentTotals.utilization,
    forecast,
    changes: {
      revenuePct: revenueChange,
      laborCostPct: laborCostChange,
      utilizationPct: utilizationChange,
    },
    series,
  };
}

