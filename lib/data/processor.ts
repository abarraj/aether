// Processes raw data_rows into aggregated KPI snapshots.
// Supports single-upload processing and full org-level recompute
// across multiple active data streams.
//
// PRIORITY: TransactionFacts (for sales) > AI detection > user column_mapping > hardcoded heuristics.
// Non-metric stream types (staff_roster, client_roster, schedule) skip
// KPI generation gracefully — rows are kept for ontology, not for KPIs.

import { startOfISOWeek, startOfMonth, formatISO, parseISO } from 'date-fns';

import { createClient } from '@/lib/supabase/server';
import { normalizeColumnMapping } from '@/lib/data/normalize-column-mapping';
import type { DetectedMetrics, StreamType } from '@/lib/ai/ontology-detector';
import {
  buildTransactionFacts,
  parseDate,
  detectDateFormat,
  parseNumeric as txParseNumeric,
} from '@/lib/data/transaction-facts';

type DataRow = {
  date: string | null;
  data: Record<string, unknown>;
};

type UploadRow = {
  id: string;
  org_id: string;
  data_type: string;
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

/** Stream types that should NOT generate KPI snapshots. */
const NON_KPI_STREAM_TYPES = new Set<string>([
  'staff_roster',
  'client_roster',
  'schedule',
  'inventory',
]);

// ── Shared Helpers ──────────────────────────────────────────────

function normKey(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseNumeric(value: unknown): number | null {
  return txParseNumeric(value);
}

/**
 * Resolve an AI-detected header name to the actual header in the data row.
 * Handles case differences, underscores vs spaces, and partial containment.
 */
function resolveHeader(detected: string, actualHeaders: string[]): string | null {
  if (!detected) return null;
  const dNorm = normKey(detected).replace(/_/g, ' ');
  for (const h of actualHeaders) {
    if (normKey(h) === dNorm) return h;
  }
  for (const h of actualHeaders) {
    if (normKey(h).replace(/_/g, ' ') === dNorm) return h;
  }
  for (const h of actualHeaders) {
    const hNorm = normKey(h).replace(/_/g, ' ');
    if (hNorm.includes(dNorm) || dNorm.includes(hNorm)) return h;
  }
  return null;
}

function resolveDetectedColumns(detected: string[], actualHeaders: string[]): string[] {
  const resolved: string[] = [];
  for (const d of detected) {
    const h = resolveHeader(d, actualHeaders);
    if (h) resolved.push(h);
  }
  return resolved;
}

/**
 * Robust date normalization using the transaction-facts parser.
 * Replaces the old `normalizeToISODate` which used `new Date()` and failed
 * on DD/MM/YYYY dates like "28/02/2026 18:02:58".
 */
function robustNormalizeDate(raw: unknown, dayFirst = true): string | null {
  const d = parseDate(raw, dayFirst);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function toDateKey(raw: string | null): string | null {
  if (!raw) return null;
  // First try ISO parse (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }
  // Fallback: robust parse
  return robustNormalizeDate(raw);
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
    return nk.includes('date') || nk.includes('time');
  });
  return loose ? record[loose] : null;
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

function extractFromDetection(
  record: Record<string, unknown>,
  detectedMetrics: DetectedMetrics,
): SnapshotMetric {
  const metrics: SnapshotMetric = {};
  for (const col of detectedMetrics.revenueColumns) {
    const n = parseNumeric(getValueByHeaderNormalized(record, col));
    if (n !== null) metrics.revenue = (metrics.revenue ?? 0) + n;
  }
  for (const col of detectedMetrics.costColumns) {
    const n = parseNumeric(getValueByHeaderNormalized(record, col));
    if (n !== null) metrics.laborCost = (metrics.laborCost ?? 0) + n;
  }
  for (const col of detectedMetrics.attendanceColumns) {
    const n = parseNumeric(getValueByHeaderNormalized(record, col));
    if (n !== null) metrics.attendance = (metrics.attendance ?? 0) + n;
  }
  for (const col of detectedMetrics.utilizationColumns) {
    const n = parseNumeric(getValueByHeaderNormalized(record, col));
    if (n !== null) metrics.utilization = (metrics.utilization ?? 0) + n;
  }
  return metrics;
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

function extractByDataType(record: Record<string, unknown>, dataType: string): SnapshotMetric {
  const metrics: SnapshotMetric = {};
  if (dataType === 'revenue') {
    const candidate =
      record.revenue ?? record.amount ?? record.total ??
      record.net ?? record.gross ?? record.Revenue ?? null;
    const value = typeof candidate === 'number' ? candidate : Number(candidate);
    if (!Number.isNaN(value) && value !== 0) metrics.revenue = value;
  } else if (dataType === 'labor') {
    const hoursCandidate = record.hours ?? record.labor_hours ?? record.Hours ?? null;
    const hours = typeof hoursCandidate === 'number' ? hoursCandidate : Number(hoursCandidate);
    const costCandidate = record.cost ?? record.labor_cost ?? record.Cost ?? null;
    const cost = typeof costCandidate === 'number' ? costCandidate : Number(costCandidate);
    if (!Number.isNaN(hours) && hours !== 0) metrics.laborHours = hours;
    if (!Number.isNaN(cost) && cost !== 0) metrics.laborCost = cost;
  } else if (dataType === 'attendance') {
    const countCandidate =
      record.attendance ?? record.count ?? record.check_ins ?? record.Attendance ?? null;
    const count =
      typeof countCandidate === 'number' ? countCandidate : Number(countCandidate || 1);
    if (!Number.isNaN(count) && count !== 0) metrics.attendance = count;
    const utilCandidate = record.utilization ?? record.Utilization ?? null;
    const utilization =
      typeof utilCandidate === 'number' ? utilCandidate : Number(utilCandidate);
    if (!Number.isNaN(utilization) && utilization !== 0) metrics.utilization = utilization;
  }
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

function buildSnapshotRows(period: Period, bucket: MetricAccumulator, orgId: string, uploadId?: string) {
  return Object.entries(bucket).map(([date, metrics]) => ({
    org_id: orgId,
    period,
    date,
    metrics,
    ...(uploadId ? { upload_id: uploadId } : {}),
  }));
}

// ── Helper: Extract DetectedMetrics from upload.detection ────────

function extractDetectedMetrics(detection: Record<string, unknown> | null): DetectedMetrics | null {
  if (!detection || typeof detection !== 'object') return null;
  const det = detection;
  if (!det.metrics || typeof det.metrics !== 'object') return null;
  const m = det.metrics as Record<string, unknown>;
  return {
    dateColumn: typeof m.dateColumn === 'string' ? m.dateColumn : null,
    revenueColumns: Array.isArray(m.revenueColumns) ? m.revenueColumns as string[] : [],
    costColumns: Array.isArray(m.costColumns) ? m.costColumns as string[] : [],
    attendanceColumns: Array.isArray(m.attendanceColumns) ? m.attendanceColumns as string[] : [],
    utilizationColumns: Array.isArray(m.utilizationColumns) ? m.utilizationColumns as string[] : [],
  };
}

// ── Single Upload Processing ────────────────────────────────────

export async function processUploadData(orgId: string, uploadId: string): Promise<void> {
  const supabase = await createClient();

  const { data: upload, error: uploadError } = await supabase
    .from('uploads')
    .select('id, org_id, data_type, column_mapping, detection, detection_stream_type')
    .eq('id', uploadId)
    .eq('org_id', orgId)
    .maybeSingle<UploadRow & {
      column_mapping: Record<string, string> | null;
      detection: Record<string, unknown> | null;
      detection_stream_type: string | null;
    }>();

  if (uploadError || !upload) return;

  const streamType = (upload.detection_stream_type ?? 'unknown') as StreamType;
  if (NON_KPI_STREAM_TYPES.has(streamType)) {
    console.log(`[processor] Skipping KPI generation for ${streamType} upload ${uploadId}`);
    return;
  }

  const detectedMetrics = extractDetectedMetrics(upload.detection);

  const { data: rows, error: rowsError } = await supabase
    .from('data_rows')
    .select('date, data')
    .eq('org_id', orgId)
    .eq('upload_id', uploadId)
    .returns<DataRow[]>();

  if (rowsError || !rows || rows.length === 0) return;

  // ── For transactions_sales: use TransactionFacts as source of truth ──
  if (streamType === 'transactions_sales') {
    const result = buildTransactionFacts(rows, detectedMetrics, upload.column_mapping);

    if (process.env.NODE_ENV !== 'production') {
      console.log('[processor] TransactionFacts built:', {
        orgId,
        uploadId,
        totalFacts: result.facts.length,
        dateFormat: result.dateFormat,
        dateParseFailures: result.dateParseFailures,
        revenueParseFailures: result.revenueParseFailures,
        resolvedRevenueColumn: result.resolvedRevenueColumn,
        resolvedDateColumn: result.resolvedDateColumn,
        dateRange: result.dateRange,
      });
    }

    if (result.facts.length === 0) {
      console.warn(`[processor] transactions_sales upload ${uploadId} produced 0 facts — date/revenue parsing failed`);
      return;
    }

    const dailyMetrics: MetricAccumulator = {};
    const weeklyMetrics: MetricAccumulator = {};
    const monthlyMetrics: MetricAccumulator = {};

    for (const fact of result.facts) {
      const dateKey = fact.dateKey;
      const weekKey = formatISO(startOfISOWeek(parseISO(dateKey)), { representation: 'date' });
      const monthKey = formatISO(startOfMonth(parseISO(dateKey)), { representation: 'date' });

      const metrics: SnapshotMetric = { revenue: fact.amountTotal };

      accumulate(dailyMetrics, dateKey, metrics);
      accumulate(weeklyMetrics, weekKey, metrics);
      accumulate(monthlyMetrics, monthKey, metrics);
    }

    const upsertRows = [
      ...buildSnapshotRows('daily', dailyMetrics, orgId, uploadId),
      ...buildSnapshotRows('weekly', weeklyMetrics, orgId, uploadId),
      ...buildSnapshotRows('monthly', monthlyMetrics, orgId, uploadId),
    ];

    if (upsertRows.length > 0) {
      await supabase.from('kpi_snapshots').delete()
        .eq('org_id', orgId)
        .eq('upload_id', uploadId);

      for (let i = 0; i < upsertRows.length; i += 500) {
        const batch = upsertRows.slice(i, i + 500);
        await supabase.from('kpi_snapshots').insert(batch);
      }
    }
    return;
  }

  // ── Non-sales uploads: use existing multi-metric extraction ──────
  const columnMapping = upload.column_mapping ?? null;
  const mapping = normalizeColumnMapping(columnMapping);
  const actualHeaders = rows.length > 0
    ? Object.keys(rows[0].data as Record<string, unknown>)
    : [];

  // Resolve detected columns against actual headers
  let resolvedDetectedMetrics: DetectedMetrics | null = null;
  if (detectedMetrics) {
    resolvedDetectedMetrics = {
      dateColumn: detectedMetrics.dateColumn
        ? resolveHeader(detectedMetrics.dateColumn, actualHeaders)
        : null,
      revenueColumns: resolveDetectedColumns(detectedMetrics.revenueColumns, actualHeaders),
      costColumns: resolveDetectedColumns(detectedMetrics.costColumns, actualHeaders),
      attendanceColumns: resolveDetectedColumns(detectedMetrics.attendanceColumns, actualHeaders),
      utilizationColumns: resolveDetectedColumns(detectedMetrics.utilizationColumns, actualHeaders),
    };

    if (process.env.NODE_ENV !== 'production') {
      console.log('[processor] Detection resolution:', {
        orgId, uploadId,
        resolvedRevenue: resolvedDetectedMetrics.revenueColumns,
        resolvedCost: resolvedDetectedMetrics.costColumns,
        resolvedDate: resolvedDetectedMetrics.dateColumn,
        actualHeadersSample: actualHeaders.slice(0, 10),
      });
    }
  }

  const detectedDateHeader = resolvedDetectedMetrics?.dateColumn ?? null;
  const mappedDateHeader = getMappedHeader(mapping, 'date');

  // Detect date format for this upload
  const dateSamples: unknown[] = [];
  for (const row of rows.slice(0, 50)) {
    const record = row.data as Record<string, unknown>;
    const rawDate = row.date
      ?? getValueByHeaderNormalized(record, detectedDateHeader)
      ?? getValueByHeaderNormalized(record, mappedDateHeader)
      ?? findFallbackDateValue(record);
    if (rawDate != null) dateSamples.push(rawDate);
  }
  const dateFormat = detectDateFormat(dateSamples);
  const dayFirst = dateFormat !== 'MM/dd/yyyy';

  const dailyMetrics: MetricAccumulator = {};
  const weeklyMetrics: MetricAccumulator = {};
  const monthlyMetrics: MetricAccumulator = {};

  for (const row of rows) {
    const record = row.data as Record<string, unknown>;

    // Date resolution: row.date > detected > mapped > fallback
    const isoFromRow = row.date ? toDateKey(row.date) : null;
    let baseDateKey: string | null = isoFromRow;
    if (!baseDateKey) {
      const rawDerived =
        getValueByHeaderNormalized(record, detectedDateHeader) ??
        getValueByHeaderNormalized(record, mappedDateHeader) ??
        findFallbackDateValue(record);
      baseDateKey = robustNormalizeDate(rawDerived, dayFirst);
    }
    if (!baseDateKey) continue;

    const parsedDate = parseISO(baseDateKey);
    const weekKey = formatISO(startOfISOWeek(parsedDate), { representation: 'date' });
    const monthKey = formatISO(startOfMonth(parsedDate), { representation: 'date' });

    const dataType = upload.data_type.toLowerCase();

    let metrics: SnapshotMetric = {};
    if (resolvedDetectedMetrics) {
      metrics = extractFromDetection(record, resolvedDetectedMetrics);
    }
    if (!hasAnyMetric(metrics)) metrics = extractFromMapping(record, mapping);
    if (!hasAnyMetric(metrics)) metrics = extractUniversal(record);
    if (!hasAnyMetric(metrics)) metrics = extractByDataType(record, dataType);
    if (!hasAnyMetric(metrics)) continue;

    accumulate(dailyMetrics, baseDateKey, metrics);
    accumulate(weeklyMetrics, weekKey, metrics);
    accumulate(monthlyMetrics, monthKey, metrics);
  }

  const upsertRows = [
    ...buildSnapshotRows('daily', dailyMetrics, orgId, uploadId),
    ...buildSnapshotRows('weekly', weeklyMetrics, orgId, uploadId),
    ...buildSnapshotRows('monthly', monthlyMetrics, orgId, uploadId),
  ];

  if (upsertRows.length === 0) return;

  await supabase.from('kpi_snapshots').delete()
    .eq('org_id', orgId)
    .eq('upload_id', uploadId);

  for (let i = 0; i < upsertRows.length; i += 500) {
    const batch = upsertRows.slice(i, i + 500);
    await supabase.from('kpi_snapshots').insert(batch);
  }
}

// ── Full Org Recompute ──────────────────────────────────────────

export async function recomputeOrgKpis(orgId: string): Promise<void> {
  const supabase = await createClient();

  const { data: activeStreams } = await supabase
    .from('data_streams')
    .select('id')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .returns<{ id: string }[]>();

  const activeStreamIds = new Set((activeStreams ?? []).map((s) => s.id));

  const { data: orgUploads } = await supabase
    .from('uploads')
    .select('id, data_type, column_mapping, stream_id, detection, detection_stream_type')
    .eq('org_id', orgId)
    .in('status', ['ready', 'processing'])
    .returns<{
      id: string;
      data_type: string;
      column_mapping: Record<string, string> | null;
      stream_id: string | null;
      detection: Record<string, unknown> | null;
      detection_stream_type: string | null;
    }[]>();

  if (!orgUploads || orgUploads.length === 0) {
    await supabase.from('kpi_snapshots').delete().eq('org_id', orgId);
    return;
  }

  const activeUploads = orgUploads.filter((u) => {
    if (!u.stream_id) return true;
    if (!activeStreamIds.has(u.stream_id)) return false;
    const st = u.detection_stream_type ?? 'unknown';
    if (NON_KPI_STREAM_TYPES.has(st)) return false;
    return true;
  });

  if (activeUploads.length === 0) {
    await supabase.from('kpi_snapshots').delete().eq('org_id', orgId);
    return;
  }

  // Delete all and rebuild
  await supabase.from('kpi_snapshots').delete().eq('org_id', orgId);

  // Process each upload individually so TransactionFacts path is used for sales
  for (const u of activeUploads) {
    await processUploadData(orgId, u.id);
  }
}
