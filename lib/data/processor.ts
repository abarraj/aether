// Processes raw data_rows for an upload into aggregated KPI snapshots.

import { parseISO, startOfDay, startOfISOWeek, startOfMonth, formatISO } from 'date-fns';

import { createClient } from '@/lib/supabase/server';

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

function toDateKey(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const date = startOfDay(parseISO(raw));
    return formatISO(date, { representation: 'date' });
  } catch {
    return null;
  }
}

export async function processUploadData(orgId: string, uploadId: string): Promise<void> {
  const supabase = await createClient();

  const { data: upload, error: uploadError } = await supabase
    .from('uploads')
    .select('id, org_id, data_type')
    .eq('id', uploadId)
    .eq('org_id', orgId)
    .maybeSingle<UploadRow>();

  if (uploadError || !upload) {
    return;
  }

  const { data: rows, error: rowsError } = await supabase
    .from('data_rows')
    .select('date, data')
    .eq('org_id', orgId)
    .eq('upload_id', uploadId)
    .returns<DataRow[]>();

  if (rowsError || !rows || rows.length === 0) {
    return;
  }

  const dailyMetrics: MetricAccumulator = {};
  const weeklyMetrics: MetricAccumulator = {};
  const monthlyMetrics: MetricAccumulator = {};

  const accumulate = (bucket: MetricAccumulator, dateKey: string, delta: SnapshotMetric) => {
    const existing = bucket[dateKey] ?? {};
    bucket[dateKey] = {
      revenue: (existing.revenue ?? 0) + (delta.revenue ?? 0),
      laborCost: (existing.laborCost ?? 0) + (delta.laborCost ?? 0),
      laborHours: (existing.laborHours ?? 0) + (delta.laborHours ?? 0),
      attendance: (existing.attendance ?? 0) + (delta.attendance ?? 0),
      utilization: (existing.utilization ?? 0) + (delta.utilization ?? 0),
    };
  };

  const REVENUE_KEYS = ['revenue', 'amount', 'total', 'net', 'gross'];
  const LABOR_COST_KEYS = ['cost', 'labor_cost', 'labour_cost'];
  const LABOR_HOURS_KEYS = ['hours', 'labor_hours'];
  const ATTENDANCE_KEYS = ['attendance', 'count', 'check_ins', 'headcount'];
  const UTILIZATION_KEYS = ['utilization', 'occupancy'];

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

  function extractByDataType(record: Record<string, unknown>, dataType: string): SnapshotMetric {
    const metrics: SnapshotMetric = {};
    if (dataType === 'revenue') {
      const candidate =
        record.revenue ??
        record.amount ??
        record.total ??
        record.net ??
        record.gross ??
        record.Revenue ??
        null;
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
        record.attendance ??
        record.count ??
        record.check_ins ??
        record.Attendance ??
        null;
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

  function hasAny(m: SnapshotMetric): boolean {
    return (
      m.revenue !== undefined ||
      m.laborCost !== undefined ||
      m.laborHours !== undefined ||
      m.attendance !== undefined ||
      m.utilization !== undefined
    );
  }

  for (const row of rows) {
    const baseDateKey = toDateKey(row.date);
    if (!baseDateKey) continue;

    const parsedDate = parseISO(baseDateKey);
    const weekKey = formatISO(startOfISOWeek(parsedDate), { representation: 'date' });
    const monthKey = formatISO(startOfMonth(parsedDate), { representation: 'date' });

    const record = row.data as Record<string, unknown>;
    const dataType = upload.data_type.toLowerCase();

    let metrics: SnapshotMetric = extractUniversal(record);
    if (!hasAny(metrics)) {
      metrics = extractByDataType(record, dataType);
    }

    if (!hasAny(metrics)) continue;

    accumulate(dailyMetrics, baseDateKey, metrics);
    accumulate(weeklyMetrics, weekKey, metrics);
    accumulate(monthlyMetrics, monthKey, metrics);
  }

  const buildRows = (period: Period, bucket: MetricAccumulator) =>
    Object.entries(bucket).map(([date, metrics]) => ({
      org_id: orgId,
      period,
      date,
      metrics,
    }));

  const upsertRows = [
    ...buildRows('daily', dailyMetrics),
    ...buildRows('weekly', weeklyMetrics),
    ...buildRows('monthly', monthlyMetrics),
  ];

  if (upsertRows.length === 0) {
    return;
  }

  await supabase.from('kpi_snapshots').upsert(upsertRows, {
    onConflict: 'org_id,period,date',
  });
}

