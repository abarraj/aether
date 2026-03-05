// Aggregates metric_snapshots into summary data for the dashboard.
//
// CLIENT-ONLY MODULE — uses the browser Supabase client (RLS-protected).
// Do NOT import this from server routes or actions.

import { parseISO, subDays, differenceInCalendarDays, formatISO } from 'date-fns';

import { createClient } from '@/lib/supabase/client';

export type Period = 'daily' | 'weekly' | 'monthly';

export interface DateRange {
  start: string;
  end: string;
}

interface MetricSnapshotRow {
  metric_key: string;
  period: string;
  period_start: string;
  period_end: string;
  value: number | null;
  computed_at: string;
  dataset_version: string | null;
  source_uploads: string[] | null;
  compute_run_id: string | null;
}

export interface MetricSeries {
  date: string;
  revenue: number | null;
  laborCost: number | null;
  laborHours: number | null;
  attendance: number | null;
  utilization: number | null;
  staffCostRatio: number | null;
}

export interface MetricChanges {
  revenuePct: number | null;
  laborCostPct: number | null;
  utilizationPct: number | null;
}

export interface MetricData {
  revenue: number;
  laborCost: number;
  laborHours: number;
  attendance: number;
  utilization: number;
  staffCostRatio: number | null;
  forecast: number | null;
  changes: MetricChanges;
  series: MetricSeries[];
  computedAt: string | null;
  datasetVersion: string | null;
}

function computeChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Fetches metric_snapshots for the given org, period, and date range.
 * Falls back to legacy kpi_snapshots if metric_snapshots is empty.
 */
export async function getMetrics(
  orgId: string,
  period: Period,
  dateRange: DateRange,
): Promise<MetricData> {
  const supabase = createClient();

  // Fetch current period metric_snapshots
  const { data: currentSnapshots } = await supabase
    .from('metric_snapshots')
    .select('metric_key, period, period_start, period_end, value, computed_at, dataset_version, source_uploads, compute_run_id')
    .eq('org_id', orgId)
    .eq('period', period)
    .gte('period_start', dateRange.start)
    .lte('period_start', dateRange.end)
    .eq('dimensions', '{}')
    .order('period_start', { ascending: true })
    .returns<MetricSnapshotRow[]>();

  const hasNewSnapshots = (currentSnapshots ?? []).length > 0;

  // If no metric_snapshots, fall back to legacy kpi_snapshots
  if (!hasNewSnapshots) {
    return fallbackToLegacy(orgId, period, dateRange);
  }

  // Fetch previous period for comparison
  const startDate = parseISO(dateRange.start);
  const endDate = parseISO(dateRange.end);
  const lengthInDays = Math.max(differenceInCalendarDays(endDate, startDate) + 1, 1);
  const previousEnd = subDays(startDate, 1);
  const previousStart = subDays(previousEnd, lengthInDays - 1);

  const { data: previousSnapshots } = await supabase
    .from('metric_snapshots')
    .select('metric_key, period_start, value')
    .eq('org_id', orgId)
    .eq('period', period)
    .gte('period_start', formatISO(previousStart, { representation: 'date' }))
    .lte('period_start', formatISO(previousEnd, { representation: 'date' }))
    .eq('dimensions', '{}')
    .returns<{ metric_key: string; period_start: string; value: number | null }[]>();

  // Group current by date for time series
  const dateMap = new Map<string, Record<string, number>>();
  let latestComputedAt: string | null = null;
  let latestDatasetVersion: string | null = null;

  for (const row of currentSnapshots ?? []) {
    if (!dateMap.has(row.period_start)) {
      dateMap.set(row.period_start, {});
    }
    const entry = dateMap.get(row.period_start)!;
    entry[row.metric_key] = row.value ?? 0;

    if (!latestComputedAt || row.computed_at > latestComputedAt) {
      latestComputedAt = row.computed_at;
    }
    if (row.dataset_version) {
      latestDatasetVersion = row.dataset_version;
    }
  }

  // Sum current period totals
  const currentTotals = { revenue: 0, laborCost: 0, laborHours: 0, attendance: 0, utilization: 0 };
  let utilizationCount = 0;

  for (const metrics of dateMap.values()) {
    currentTotals.revenue += metrics['revenue'] ?? 0;
    currentTotals.laborCost += metrics['labor_cost'] ?? 0;
    currentTotals.laborHours += metrics['labor_hours'] ?? 0;
    currentTotals.attendance += metrics['attendance'] ?? 0;
    if (metrics['utilization']) {
      currentTotals.utilization += metrics['utilization'];
      utilizationCount++;
    }
  }

  const avgUtilization = utilizationCount > 0 ? currentTotals.utilization / utilizationCount : 0;

  // Sum previous period
  const previousTotals = { revenue: 0, laborCost: 0, utilization: 0 };
  let prevUtilCount = 0;

  for (const row of previousSnapshots ?? []) {
    const val = row.value ?? 0;
    if (row.metric_key === 'revenue') previousTotals.revenue += val;
    if (row.metric_key === 'labor_cost') previousTotals.laborCost += val;
    if (row.metric_key === 'utilization') {
      previousTotals.utilization += val;
      prevUtilCount++;
    }
  }

  const prevAvgUtil = prevUtilCount > 0 ? previousTotals.utilization / prevUtilCount : 0;

  // Build series
  const sortedDates = [...dateMap.keys()].sort();
  const series: MetricSeries[] = sortedDates.map((date) => {
    const m = dateMap.get(date) ?? {};
    return {
      date,
      revenue: m['revenue'] ?? null,
      laborCost: m['labor_cost'] ?? null,
      laborHours: m['labor_hours'] ?? null,
      attendance: m['attendance'] ?? null,
      utilization: m['utilization'] ?? null,
      staffCostRatio: m['staff_cost_ratio'] ?? null,
    };
  });

  // Forecast
  const revenueSeries = series.map((s) => s.revenue).filter((v): v is number => v !== null);
  const avgDailyRevenue = revenueSeries.length > 0
    ? revenueSeries.reduce((a, b) => a + b, 0) / revenueSeries.length
    : 0;
  const forecast = avgDailyRevenue > 0 ? avgDailyRevenue * revenueSeries.length : null;

  // Staff cost ratio
  const staffCostRatio = currentTotals.revenue > 0
    ? (currentTotals.laborCost / currentTotals.revenue) * 100
    : null;

  return {
    revenue: currentTotals.revenue,
    laborCost: currentTotals.laborCost,
    laborHours: currentTotals.laborHours,
    attendance: currentTotals.attendance,
    utilization: avgUtilization,
    staffCostRatio,
    forecast,
    changes: {
      revenuePct: computeChange(currentTotals.revenue, previousTotals.revenue),
      laborCostPct: computeChange(currentTotals.laborCost, previousTotals.laborCost),
      utilizationPct: computeChange(avgUtilization, prevAvgUtil),
    },
    series,
    computedAt: latestComputedAt,
    datasetVersion: latestDatasetVersion,
  };
}

/**
 * Falls back to legacy kpi_snapshots when metric_snapshots is empty.
 * This ensures backward compatibility during migration.
 */
async function fallbackToLegacy(
  orgId: string,
  period: Period,
  dateRange: DateRange,
): Promise<MetricData> {
  const supabase = createClient();

  const { data: currentSnapshots } = await supabase
    .from('kpi_snapshots')
    .select('date, metrics')
    .eq('org_id', orgId)
    .eq('period', period)
    .gte('date', dateRange.start)
    .lte('date', dateRange.end)
    .order('date', { ascending: true })
    .returns<{ date: string; metrics: { revenue?: number | null; laborCost?: number | null; utilization?: number | null; laborHours?: number | null; attendance?: number | null } }[]>();

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
    .returns<{ date: string; metrics: { revenue?: number | null; laborCost?: number | null; utilization?: number | null } }[]>();

  const sumMetrics = (snaps: typeof currentSnapshots) => {
    return (snaps ?? []).reduce(
      (acc, s) => ({
        revenue: acc.revenue + (s.metrics.revenue ?? 0),
        laborCost: acc.laborCost + (s.metrics.laborCost ?? 0),
        utilization: acc.utilization + (s.metrics.utilization ?? 0),
      }),
      { revenue: 0, laborCost: 0, utilization: 0 },
    );
  };

  const currentTotals = sumMetrics(currentSnapshots);
  const previousTotals = sumMetrics(previousSnapshots);

  const series: MetricSeries[] = (currentSnapshots ?? []).map((s) => ({
    date: s.date,
    revenue: s.metrics.revenue ?? null,
    laborCost: s.metrics.laborCost ?? null,
    laborHours: s.metrics.laborHours ?? null,
    attendance: s.metrics.attendance ?? null,
    utilization: s.metrics.utilization ?? null,
    staffCostRatio: null,
  }));

  const avgDaily =
    series.length > 0
      ? series.reduce((sum, p) => sum + (p.revenue ?? 0), 0) / series.length
      : 0;

  return {
    revenue: currentTotals.revenue,
    laborCost: currentTotals.laborCost,
    laborHours: 0,
    attendance: 0,
    utilization: currentTotals.utilization,
    staffCostRatio: currentTotals.revenue > 0 ? (currentTotals.laborCost / currentTotals.revenue) * 100 : null,
    forecast: avgDaily > 0 ? avgDaily * series.length : null,
    changes: {
      revenuePct: computeChange(currentTotals.revenue, previousTotals.revenue),
      laborCostPct: computeChange(currentTotals.laborCost, previousTotals.laborCost),
      utilizationPct: computeChange(currentTotals.utilization, previousTotals.utilization),
    },
    series,
    computedAt: null,
    datasetVersion: null,
  };
}

/**
 * Detects the available date range in metric_snapshots (or kpi_snapshots).
 * Returns null if no data exists.
 */
export async function getDataRange(
  orgId: string,
): Promise<{ min: string; max: string } | null> {
  const supabase = createClient();

  // Try metric_snapshots first
  const { data: msRange } = await supabase
    .from('metric_snapshots')
    .select('period_start')
    .eq('org_id', orgId)
    .eq('period', 'daily')
    .eq('dimensions', '{}')
    .order('period_start', { ascending: true })
    .limit(1)
    .maybeSingle<{ period_start: string }>();

  if (msRange) {
    const { data: msMax } = await supabase
      .from('metric_snapshots')
      .select('period_start')
      .eq('org_id', orgId)
      .eq('period', 'daily')
      .eq('dimensions', '{}')
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle<{ period_start: string }>();

    return { min: msRange.period_start, max: msMax?.period_start ?? msRange.period_start };
  }

  // Fallback: kpi_snapshots
  const { data: ksMin } = await supabase
    .from('kpi_snapshots')
    .select('date')
    .eq('org_id', orgId)
    .eq('period', 'daily')
    .order('date', { ascending: true })
    .limit(1)
    .maybeSingle<{ date: string }>();

  if (!ksMin) return null;

  const { data: ksMax } = await supabase
    .from('kpi_snapshots')
    .select('date')
    .eq('org_id', orgId)
    .eq('period', 'daily')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle<{ date: string }>();

  return { min: ksMin.date, max: ksMax?.date ?? ksMin.date };
}
