// Deterministic compute engine for the analytics pipeline.
// Aggregates data_rows across active streams into metric_snapshots,
// writes legacy kpi_snapshots for backward compatibility, and records
// every run in compute_runs for auditability.

import { createHash } from 'node:crypto';

import {
  parseISO,
  startOfDay,
  startOfISOWeek,
  endOfISOWeek,
  startOfMonth,
  endOfMonth,
  formatISO,
  addDays,
  subDays,
} from 'date-fns';

import { createClient } from '@/lib/supabase/server';
import { normalizeColumnMapping } from '@/lib/data/normalize-column-mapping';

// ── Types ───────────────────────────────────────────────────────

type DataRow = {
  date: string | null;
  data: Record<string, unknown>;
  upload_id: string;
};

type Period = 'daily' | 'weekly' | 'monthly';

interface SnapshotMetric {
  revenue?: number;
  laborCost?: number;
  laborHours?: number;
  attendance?: number;
  utilization?: number;
}

type MetricAccumulator = Record<string, SnapshotMetric>;

interface ComputeResult {
  computeRunId: string;
  metricsComputed: number;
  rowsProcessed: number;
  durationMs: number;
}

// ── Shared Helpers (ported from processor.ts) ───────────────────

function normKey(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,]/g, '').trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toDateKey(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const date = startOfDay(parseISO(raw));
    return formatISO(date, { representation: 'date' });
  } catch {
    return null;
  }
}

function getMappedHeader(mapping: Record<string, string> | null, role: string): string | null {
  if (!mapping) return null;
  for (const [header, r] of Object.entries(mapping)) {
    if (r === role) return header;
  }
  return null;
}

function getValueByHeaderNormalized(record: Record<string, unknown>, header: string | null): unknown {
  if (!header) return null;
  const target = normKey(header);
  for (const k of Object.keys(record)) {
    if (normKey(k) === target) return record[k];
  }
  return null;
}

function findFallbackDateValue(record: Record<string, unknown>): unknown {
  const keys = Object.keys(record);
  const priority = [
    'week_start', 'week start', 'period_start', 'period start',
    'start_date', 'start date', 'date', 'time', 'timestamp',
  ];
  for (const want of priority) {
    const match = keys.find((k) => normKey(k) === want);
    if (match) return record[match];
  }
  const loose = keys.find((k) => {
    const nk = normKey(k);
    return nk.includes('date') || nk.includes('time') || nk.includes('period_start');
  });
  return loose ? record[loose] : null;
}

function normalizeToISODate(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// ── Metric Extraction ───────────────────────────────────────────

const REVENUE_KEYS = [
  'revenue', 'amount', 'total', 'net', 'gross', 'sales',
  'income', 'price', 'revenue_per_class', 'total_revenue',
];
const LABOR_COST_KEYS = [
  'cost', 'labor_cost', 'labour_cost', 'staff_cost',
  'instructor_cost', 'salary', 'wages', 'payroll', 'commission',
];
const LABOR_HOURS_KEYS = ['hours', 'labor_hours'];
const ATTENDANCE_KEYS = [
  'attendance', 'count', 'check_ins', 'headcount', 'attended',
  'booked', 'signups', 'participants', 'deals_closed',
];
const UTILIZATION_KEYS = ['utilization', 'occupancy', 'fill_rate', 'capacity_pct', 'usage'];

function getByKeys(map: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const val = map[key];
    if (val === undefined || val === null) continue;
    const num = typeof val === 'number' ? val : Number(val);
    if (!Number.isNaN(num) && num !== 0) return num;
  }
  return undefined;
}

function extractUniversal(record: Record<string, unknown>): SnapshotMetric {
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    lower[k.toLowerCase().trim()] = v;
  }
  const metrics: SnapshotMetric = {};
  const rev = getByKeys(lower, REVENUE_KEYS);
  if (rev !== undefined) metrics.revenue = rev;
  const laborCost = getByKeys(lower, LABOR_COST_KEYS);
  if (laborCost !== undefined) metrics.laborCost = laborCost;
  const laborHours = getByKeys(lower, LABOR_HOURS_KEYS);
  if (laborHours !== undefined) metrics.laborHours = laborHours;
  const attendance = getByKeys(lower, ATTENDANCE_KEYS);
  if (attendance !== undefined) metrics.attendance = attendance;
  const utilization = getByKeys(lower, UTILIZATION_KEYS);
  if (utilization !== undefined) metrics.utilization = utilization;
  return metrics;
}

function extractFromMapping(
  record: Record<string, unknown>,
  mapping: Record<string, string> | null,
): SnapshotMetric {
  if (!mapping) return {};
  const metrics: SnapshotMetric = {};
  for (const [header, role] of Object.entries(mapping)) {
    const n = parseNumeric(getValueByHeaderNormalized(record, header));
    if (n === null) continue;
    if (role === 'revenue') metrics.revenue = (metrics.revenue ?? 0) + n;
    if (role === 'cost') metrics.laborCost = (metrics.laborCost ?? 0) + n;
    if (role === 'labor_hours') metrics.laborHours = (metrics.laborHours ?? 0) + n;
    if (role === 'attendance') metrics.attendance = (metrics.attendance ?? 0) + n;
    if (role === 'utilization') metrics.utilization = (metrics.utilization ?? 0) + n;
  }
  return metrics;
}

function hasAnyMetric(m: SnapshotMetric): boolean {
  return (
    m.revenue !== undefined ||
    m.laborCost !== undefined ||
    m.laborHours !== undefined ||
    m.attendance !== undefined ||
    m.utilization !== undefined
  );
}

function accumulate(bucket: MetricAccumulator, dateKey: string, delta: SnapshotMetric): void {
  const existing = bucket[dateKey] ?? {};
  bucket[dateKey] = {
    revenue: (existing.revenue ?? 0) + (delta.revenue ?? 0),
    laborCost: (existing.laborCost ?? 0) + (delta.laborCost ?? 0),
    laborHours: (existing.laborHours ?? 0) + (delta.laborHours ?? 0),
    attendance: (existing.attendance ?? 0) + (delta.attendance ?? 0),
    utilization: (existing.utilization ?? 0) + (delta.utilization ?? 0),
  };
}

// ── Period End Computation ──────────────────────────────────────

function periodEnd(periodType: Period, periodStart: string): string {
  const d = parseISO(periodStart);
  if (periodType === 'daily') {
    return periodStart; // same day
  }
  if (periodType === 'weekly') {
    return formatISO(endOfISOWeek(d), { representation: 'date' });
  }
  // monthly
  return formatISO(endOfMonth(d), { representation: 'date' });
}

// ── Dataset Version Hash ────────────────────────────────────────

function computeDatasetVersion(checksums: string[]): string {
  const sorted = [...checksums].sort();
  return createHash('sha256').update(sorted.join(':')).digest('hex').slice(0, 16);
}

// ── Main Compute Engine ────────────────────────────────────────

/**
 * Runs a full deterministic metric computation for an org.
 * 1. Creates compute_run (status=running)
 * 2. Aggregates data_rows from active streams
 * 3. Writes metric_snapshots (delete + insert)
 * 4. Writes legacy kpi_snapshots for backward compat
 * 5. Updates compute_run to completed/failed
 */
export async function runComputeJob(
  orgId: string,
  trigger: 'upload' | 'stream_change' | 'manual' | 'scheduled' = 'upload',
  triggerRef?: string,
): Promise<ComputeResult> {
  const supabase = await createClient();
  const startTime = Date.now();

  // 1. Create compute_run record
  const { data: run, error: runError } = await supabase
    .from('compute_runs')
    .insert({
      org_id: orgId,
      trigger,
      trigger_ref: triggerRef ?? null,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle<{ id: string }>();

  if (runError || !run) {
    throw new Error(`Failed to create compute run: ${runError?.message ?? 'unknown'}`);
  }

  const computeRunId = run.id;

  try {
    // 2. Find active streams
    const { data: activeStreams } = await supabase
      .from('data_streams')
      .select('id')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .returns<{ id: string }[]>();

    const activeStreamIds = new Set((activeStreams ?? []).map((s) => s.id));

    // 3. Get uploads from active streams
    const { data: orgUploads } = await supabase
      .from('uploads')
      .select('id, data_type, column_mapping, stream_id')
      .eq('org_id', orgId)
      .in('status', ['ready', 'processing'])
      .returns<{
        id: string;
        data_type: string;
        column_mapping: Record<string, string> | null;
        stream_id: string | null;
      }[]>();

    const activeUploads = (orgUploads ?? []).filter((u) => {
      if (!u.stream_id) return true;
      return activeStreamIds.has(u.stream_id);
    });

    const uploadIds = activeUploads.map((u) => u.id);

    if (activeUploads.length === 0) {
      // No data — clear everything
      await supabase.from('metric_snapshots').delete().eq('org_id', orgId);
      await supabase.from('kpi_snapshots').delete().eq('org_id', orgId);

      const durationMs = Date.now() - startTime;
      await supabase
        .from('compute_runs')
        .update({
          status: 'completed',
          metrics_computed: 0,
          rows_processed: 0,
          finished_at: new Date().toISOString(),
          duration_ms: durationMs,
        })
        .eq('id', computeRunId);

      return { computeRunId, metricsComputed: 0, rowsProcessed: 0, durationMs };
    }

    // Build upload metadata
    const uploadMappings = new Map(
      activeUploads.map((u) => [u.id, normalizeColumnMapping(u.column_mapping)]),
    );

    // Get dataset version from stream_versions checksums
    const { data: streamVersions } = await supabase
      .from('stream_versions')
      .select('file_checksum')
      .eq('org_id', orgId)
      .eq('status', 'committed')
      .returns<{ file_checksum: string | null }[]>();

    const checksums = (streamVersions ?? [])
      .map((sv) => sv.file_checksum)
      .filter((c): c is string => c !== null);
    const datasetVersion = checksums.length > 0 ? computeDatasetVersion(checksums) : null;

    // 4. Fetch all data_rows
    const { data: allRows, error: rowsError } = await supabase
      .from('data_rows')
      .select('date, data, upload_id')
      .eq('org_id', orgId)
      .in('upload_id', uploadIds)
      .returns<DataRow[]>();

    if (rowsError || !allRows || allRows.length === 0) {
      await supabase.from('metric_snapshots').delete().eq('org_id', orgId);
      await supabase.from('kpi_snapshots').delete().eq('org_id', orgId);

      const durationMs = Date.now() - startTime;
      await supabase
        .from('compute_runs')
        .update({
          status: 'completed',
          metrics_computed: 0,
          rows_processed: 0,
          finished_at: new Date().toISOString(),
          duration_ms: durationMs,
        })
        .eq('id', computeRunId);

      return { computeRunId, metricsComputed: 0, rowsProcessed: 0, durationMs };
    }

    // 5. Aggregate metrics by period
    const dailyMetrics: MetricAccumulator = {};
    const weeklyMetrics: MetricAccumulator = {};
    const monthlyMetrics: MetricAccumulator = {};

    let rowsProcessed = 0;

    for (const row of allRows) {
      const record = row.data as Record<string, unknown>;
      const mapping = uploadMappings.get(row.upload_id) ?? null;
      const mappedDateHeader = getMappedHeader(mapping, 'date');

      const isoFromRow = row.date ? toDateKey(row.date) : null;
      const rawDerived =
        getValueByHeaderNormalized(record, mappedDateHeader) ?? findFallbackDateValue(record);
      const isoDerived = !isoFromRow ? normalizeToISODate(rawDerived) : null;

      const baseDateKey = toDateKey(isoFromRow ?? isoDerived);
      if (!baseDateKey) continue;

      const parsedDate = parseISO(baseDateKey);
      const weekKey = formatISO(startOfISOWeek(parsedDate), { representation: 'date' });
      const monthKey = formatISO(startOfMonth(parsedDate), { representation: 'date' });

      let metrics: SnapshotMetric = extractFromMapping(record, mapping);
      if (!hasAnyMetric(metrics)) metrics = extractUniversal(record);
      if (!hasAnyMetric(metrics)) continue;

      accumulate(dailyMetrics, baseDateKey, metrics);
      accumulate(weeklyMetrics, weekKey, metrics);
      accumulate(monthlyMetrics, monthKey, metrics);
      rowsProcessed++;
    }

    // 6. Build metric_snapshots rows
    const now = new Date().toISOString();
    const metricSnapshotRows: {
      org_id: string;
      metric_key: string;
      period: string;
      period_start: string;
      period_end: string;
      value: number;
      dimensions: Record<string, unknown>;
      dataset_version: string | null;
      source_uploads: string[];
      computed_at: string;
      compute_run_id: string;
    }[] = [];

    const METRIC_KEYS_MAP: { snapshotField: keyof SnapshotMetric; metricKey: string }[] = [
      { snapshotField: 'revenue', metricKey: 'revenue' },
      { snapshotField: 'laborCost', metricKey: 'labor_cost' },
      { snapshotField: 'laborHours', metricKey: 'labor_hours' },
      { snapshotField: 'attendance', metricKey: 'attendance' },
      { snapshotField: 'utilization', metricKey: 'utilization' },
    ];

    function emitSnapshots(
      periodType: Period,
      bucket: MetricAccumulator,
    ) {
      for (const [dateKey, metrics] of Object.entries(bucket)) {
        for (const { snapshotField, metricKey } of METRIC_KEYS_MAP) {
          const val = metrics[snapshotField];
          if (val === undefined || val === 0) continue;
          metricSnapshotRows.push({
            org_id: orgId,
            metric_key: metricKey,
            period: periodType,
            period_start: dateKey,
            period_end: periodEnd(periodType, dateKey),
            value: val,
            dimensions: {},
            dataset_version: datasetVersion,
            source_uploads: uploadIds,
            computed_at: now,
            compute_run_id: computeRunId,
          });
        }
      }
    }

    emitSnapshots('daily', dailyMetrics);
    emitSnapshots('weekly', weeklyMetrics);
    emitSnapshots('monthly', monthlyMetrics);

    // 7. Compute derived metrics (weekly/monthly aggregates)
    const derivedRows = computeDerivedMetrics(
      dailyMetrics,
      weeklyMetrics,
      monthlyMetrics,
      orgId,
      datasetVersion,
      uploadIds,
      now,
      computeRunId,
    );
    metricSnapshotRows.push(...derivedRows);

    // 8. Delete + insert metric_snapshots (deterministic)
    await supabase.from('metric_snapshots').delete().eq('org_id', orgId);
    if (metricSnapshotRows.length > 0) {
      // Insert in batches of 500 to avoid payload limits
      for (let i = 0; i < metricSnapshotRows.length; i += 500) {
        const batch = metricSnapshotRows.slice(i, i + 500);
        await supabase.from('metric_snapshots').insert(batch);
      }
    }

    // 9. Write legacy kpi_snapshots for backward compat
    const legacyRows = buildLegacyKpiRows(dailyMetrics, weeklyMetrics, monthlyMetrics, orgId);
    await supabase.from('kpi_snapshots').delete().eq('org_id', orgId);
    if (legacyRows.length > 0) {
      await supabase.from('kpi_snapshots').insert(legacyRows);
    }

    // 10. Update compute_run to completed
    const durationMs = Date.now() - startTime;
    await supabase
      .from('compute_runs')
      .update({
        status: 'completed',
        metrics_computed: metricSnapshotRows.length,
        rows_processed: rowsProcessed,
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
      })
      .eq('id', computeRunId);

    return {
      computeRunId,
      metricsComputed: metricSnapshotRows.length,
      rowsProcessed,
      durationMs,
    };
  } catch (error) {
    // Mark compute_run as failed
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown compute error';
    await supabase
      .from('compute_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        error_message: errorMessage,
      })
      .eq('id', computeRunId);

    throw error;
  }
}

// ── Derived Metrics ─────────────────────────────────────────────

function computeDerivedMetrics(
  dailyMetrics: MetricAccumulator,
  weeklyMetrics: MetricAccumulator,
  monthlyMetrics: MetricAccumulator,
  orgId: string,
  datasetVersion: string | null,
  sourceUploads: string[],
  computedAt: string,
  computeRunId: string,
) {
  const rows: {
    org_id: string;
    metric_key: string;
    period: string;
    period_start: string;
    period_end: string;
    value: number;
    dimensions: Record<string, unknown>;
    dataset_version: string | null;
    source_uploads: string[];
    computed_at: string;
    compute_run_id: string;
  }[] = [];

  function makeRow(
    metricKey: string,
    period: Period,
    pStart: string,
    value: number,
  ) {
    return {
      org_id: orgId,
      metric_key: metricKey,
      period,
      period_start: pStart,
      period_end: periodEnd(period, pStart),
      value,
      dimensions: {},
      dataset_version: datasetVersion,
      source_uploads: sourceUploads,
      computed_at: computedAt,
      compute_run_id: computeRunId,
    };
  }

  // Staff cost ratio per period
  function emitStaffCostRatio(periodType: Period, bucket: MetricAccumulator) {
    for (const [dateKey, m] of Object.entries(bucket)) {
      const rev = m.revenue ?? 0;
      const cost = m.laborCost ?? 0;
      if (rev > 0 && cost > 0) {
        rows.push(makeRow('staff_cost_ratio', periodType, dateKey, (cost / rev) * 100));
      }
    }
  }

  emitStaffCostRatio('daily', dailyMetrics);
  emitStaffCostRatio('weekly', weeklyMetrics);
  emitStaffCostRatio('monthly', monthlyMetrics);

  // Revenue variance (CV) — computed per week/month from daily values
  function emitVariance(
    metricField: keyof SnapshotMetric,
    metricKey: string,
    periodType: 'weekly' | 'monthly',
    parentBucket: MetricAccumulator,
  ) {
    // Group daily values by their parent period
    const groups: Record<string, number[]> = {};
    for (const [dateKey, m] of Object.entries(dailyMetrics)) {
      const val = m[metricField];
      if (val === undefined) continue;
      const d = parseISO(dateKey);
      const parentKey =
        periodType === 'weekly'
          ? formatISO(startOfISOWeek(d), { representation: 'date' })
          : formatISO(startOfMonth(d), { representation: 'date' });
      if (!parentBucket[parentKey]) continue; // only emit for periods that exist
      if (!groups[parentKey]) groups[parentKey] = [];
      groups[parentKey].push(val);
    }

    for (const [pKey, values] of Object.entries(groups)) {
      if (values.length < 2) continue;
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      if (mean === 0) continue;
      const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
      const stdDev = Math.sqrt(variance);
      const cv = stdDev / Math.abs(mean);
      rows.push(makeRow(metricKey, periodType, pKey, Math.round(cv * 10000) / 10000));
    }
  }

  emitVariance('revenue', 'revenue_variance', 'weekly', weeklyMetrics);
  emitVariance('revenue', 'revenue_variance', 'monthly', monthlyMetrics);
  emitVariance('laborCost', 'labor_cost_variance', 'weekly', weeklyMetrics);
  emitVariance('laborCost', 'labor_cost_variance', 'monthly', monthlyMetrics);

  // Correlations — computed per week/month from daily pairs
  function emitCorrelation(
    fieldA: keyof SnapshotMetric,
    fieldB: keyof SnapshotMetric,
    metricKey: string,
    periodType: 'weekly' | 'monthly',
    parentBucket: MetricAccumulator,
  ) {
    const groups: Record<string, { a: number; b: number }[]> = {};
    for (const [dateKey, m] of Object.entries(dailyMetrics)) {
      const a = m[fieldA];
      const b = m[fieldB];
      if (a === undefined || b === undefined) continue;
      const d = parseISO(dateKey);
      const parentKey =
        periodType === 'weekly'
          ? formatISO(startOfISOWeek(d), { representation: 'date' })
          : formatISO(startOfMonth(d), { representation: 'date' });
      if (!parentBucket[parentKey]) continue;
      if (!groups[parentKey]) groups[parentKey] = [];
      groups[parentKey].push({ a, b });
    }

    for (const [pKey, pairs] of Object.entries(groups)) {
      if (pairs.length < 3) continue; // need at least 3 data points for meaningful correlation
      const r = pearsonR(
        pairs.map((p) => p.a),
        pairs.map((p) => p.b),
      );
      if (r !== null) {
        rows.push(makeRow(metricKey, periodType, pKey, Math.round(r * 10000) / 10000));
      }
    }
  }

  emitCorrelation('revenue', 'laborCost', 'corr_revenue_labor', 'weekly', weeklyMetrics);
  emitCorrelation('revenue', 'laborCost', 'corr_revenue_labor', 'monthly', monthlyMetrics);
  emitCorrelation('revenue', 'attendance', 'corr_revenue_attendance', 'weekly', weeklyMetrics);
  emitCorrelation('revenue', 'attendance', 'corr_revenue_attendance', 'monthly', monthlyMetrics);

  // Revenue forecast — simple average daily projected over period
  function emitForecast(periodType: 'weekly' | 'monthly', parentBucket: MetricAccumulator) {
    const groups: Record<string, number[]> = {};
    for (const [dateKey, m] of Object.entries(dailyMetrics)) {
      const rev = m.revenue;
      if (rev === undefined) continue;
      const d = parseISO(dateKey);
      const parentKey =
        periodType === 'weekly'
          ? formatISO(startOfISOWeek(d), { representation: 'date' })
          : formatISO(startOfMonth(d), { representation: 'date' });
      if (!parentBucket[parentKey]) continue;
      if (!groups[parentKey]) groups[parentKey] = [];
      groups[parentKey].push(rev);
    }

    for (const [pKey, values] of Object.entries(groups)) {
      if (values.length === 0) continue;
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const daysInPeriod = periodType === 'weekly' ? 7 : daysInMonth(pKey);
      rows.push(makeRow('revenue_forecast', periodType, pKey, Math.round(avg * daysInPeriod * 100) / 100));
    }
  }

  emitForecast('weekly', weeklyMetrics);
  emitForecast('monthly', monthlyMetrics);

  return rows;
}

// ── Statistical Helpers ─────────────────────────────────────────

function pearsonR(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  if (den === 0) return null;
  return num / den;
}

function daysInMonth(isoDate: string): number {
  const d = parseISO(isoDate);
  const end = endOfMonth(d);
  return end.getDate();
}

// ── Legacy kpi_snapshots builder ────────────────────────────────

function buildLegacyKpiRows(
  daily: MetricAccumulator,
  weekly: MetricAccumulator,
  monthly: MetricAccumulator,
  orgId: string,
) {
  const rows: { org_id: string; period: string; date: string; metrics: SnapshotMetric }[] = [];

  function emit(period: string, bucket: MetricAccumulator) {
    for (const [date, metrics] of Object.entries(bucket)) {
      rows.push({ org_id: orgId, period, date, metrics });
    }
  }

  emit('daily', daily);
  emit('weekly', weekly);
  emit('monthly', monthly);
  return rows;
}
