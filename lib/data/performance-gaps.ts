// Performance gap engine v2.
// Computes revenue leakage as an explainable metric:
//   leakage = max(0, baseline - actual)
//   baseline = rolling median of previous 4 weeks (per dimension value)
//
// PRIORITY: AI-detected revenue columns > hardcoded REVENUE_CANDIDATES.
// Uses robust date parsing from transaction-facts for consistency with KPIs.

import { parseISO, startOfISOWeek } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { parseDate, detectDateFormat, parseNumeric } from '@/lib/data/transaction-facts';

type DataRow = {
  date: string | null;
  data: Record<string, unknown>;
};

function normKey(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, ' ');
}

function resolveRevenueHeader(detected: string, dataKeys: string[]): string | null {
  if (!detected) return null;
  const dNorm = normKey(detected).replace(/_/g, ' ');
  for (const k of dataKeys) {
    if (normKey(k) === dNorm) return k;
  }
  for (const k of dataKeys) {
    if (normKey(k).replace(/_/g, ' ') === dNorm) return k;
  }
  for (const k of dataKeys) {
    const kNorm = normKey(k).replace(/_/g, ' ');
    if (kNorm.includes(dNorm) || dNorm.includes(kNorm)) return k;
  }
  return null;
}

function toWeekStart(dateStr: string): string | null {
  try {
    return startOfISOWeek(parseISO(dateStr)).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

// Revenue column priority: "Total" first, then AI detection, then fallbacks.
const TOTAL_CANDIDATES = ['total', 'total paid', 'amount paid', 'final amount', 'net total'];
const REVENUE_CANDIDATES = [
  'revenue', 'amount', 'net', 'gross', 'sales',
  'income', 'total_revenue', 'revenue_per_class', 'price',
];

const EXPECTED_CANDIDATES = [
  'target_revenue', 'expected_revenue', 'max_possible_revenue',
  'target', 'expected', 'budget', 'capacity_revenue', 'max_revenue',
];

function findColumn(dataKeys: string[], candidates: string[]): string | null {
  const lowerKeys = dataKeys.map((k) => normKey(k));
  for (const candidate of candidates) {
    const idx = lowerKeys.indexOf(candidate);
    if (idx !== -1) return dataKeys[idx];
  }
  // Partial match
  for (const candidate of candidates) {
    const idx = lowerKeys.findIndex((h) => h.includes(candidate) || candidate.includes(h));
    if (idx !== -1) return dataKeys[idx];
  }
  return null;
}

async function getDimensionColumns(
  orgId: string,
  uploadId: string,
): Promise<{ slug: string; name: string; sourceColumn: string }[]> {
  const supabase = await createClient();

  const { data: entityTypes } = await supabase
    .from('entity_types')
    .select('slug, name, source_column')
    .eq('org_id', orgId);

  if (!entityTypes || entityTypes.length === 0) return [];

  const { data: sampleRows } = await supabase
    .from('data_rows')
    .select('data')
    .eq('org_id', orgId)
    .eq('upload_id', uploadId)
    .limit(1);

  if (!sampleRows || sampleRows.length === 0) return [];

  const dataKeys = Object.keys((sampleRows[0].data ?? {}) as Record<string, unknown>);
  const lowerKeys = dataKeys.map((k) => normKey(k));
  const sampleData = (sampleRows[0].data ?? {}) as Record<string, unknown>;

  const result: { slug: string; name: string; sourceColumn: string }[] = [];

  for (const et of entityTypes) {
    const etWithSource = et as { slug: string; name: string; source_column?: string | null };
    if (etWithSource.source_column && lowerKeys.includes(normKey(etWithSource.source_column))) {
      const originalCol = dataKeys[lowerKeys.indexOf(normKey(etWithSource.source_column))];
      const sampleVal = sampleData[originalCol];
      if (sampleVal != null && typeof sampleVal === 'string' && sampleVal.length > 0) {
        result.push({ slug: et.slug, name: et.name, sourceColumn: originalCol });
        continue;
      }
    }

    const slugNorm = normKey(et.slug.replace(/_/g, ' '));
    const slugUnderscore = et.slug.toLowerCase();
    let matchedCol: string | null = null;

    const exactIdx = lowerKeys.indexOf(slugUnderscore);
    if (exactIdx !== -1) matchedCol = dataKeys[exactIdx];
    if (!matchedCol) {
      const spaceIdx = lowerKeys.indexOf(slugNorm);
      if (spaceIdx !== -1) matchedCol = dataKeys[spaceIdx];
    }
    if (!matchedCol) {
      const nameNorm = normKey(et.name);
      const nameIdx = lowerKeys.indexOf(nameNorm);
      if (nameIdx !== -1) matchedCol = dataKeys[nameIdx];
    }
    if (!matchedCol) {
      const partialIdx = lowerKeys.findIndex(
        (k) => k.includes(slugUnderscore) || slugUnderscore.includes(k),
      );
      if (partialIdx !== -1) matchedCol = dataKeys[partialIdx];
    }

    if (matchedCol) {
      const sampleVal = sampleData[matchedCol];
      if (sampleVal != null && typeof sampleVal === 'string' && sampleVal.length > 0) {
        result.push({ slug: et.slug, name: et.name, sourceColumn: matchedCol });
      }
    }
  }

  return result;
}

// ── Rolling Median Baseline ─────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Compute rolling baseline for each dimension value per week.
 * Uses median of previous N weeks (default 4).
 *
 * Returns a map: dimensionValue → weekStart → { baseline, weeksUsed }
 */
function computeRollingBaselines(
  weeklyActuals: Map<string, Map<string, number>>, // dimValue → week → actual
  sortedWeeks: string[],
  lookback = 4,
): Map<string, Map<string, { baseline: number; weeksUsed: number }>> {
  const result = new Map<string, Map<string, { baseline: number; weeksUsed: number }>>();

  for (const [dimValue, weekMap] of weeklyActuals) {
    const baselines = new Map<string, { baseline: number; weeksUsed: number }>();

    for (let i = 0; i < sortedWeeks.length; i++) {
      const week = sortedWeeks[i];
      // Gather previous weeks' actuals
      const prevActuals: number[] = [];
      for (let j = Math.max(0, i - lookback); j < i; j++) {
        const prevWeek = sortedWeeks[j];
        const val = weekMap.get(prevWeek);
        if (val !== undefined && val > 0) prevActuals.push(val);
      }

      baselines.set(week, {
        baseline: prevActuals.length >= 3 ? median(prevActuals) : 0,
        weeksUsed: prevActuals.length,
      });
    }

    result.set(dimValue, baselines);
  }

  return result;
}

// ── Main Computation ────────────────────────────────────────────

export interface LeakageExplanation {
  baseline: number;
  actual: number;
  weeksUsed: number;
  insufficient: boolean;
  method: 'rolling_median_4w';
}

export async function computePerformanceGaps(
  orgId: string,
  uploadId: string,
): Promise<void> {
  const supabase = await createClient();

  // Fetch upload detection for AI-detected revenue columns
  const { data: upload } = await supabase
    .from('uploads')
    .select('detection')
    .eq('id', uploadId)
    .eq('org_id', orgId)
    .maybeSingle<{ detection: Record<string, unknown> | null }>();

  const { data: rows, error: rowsError } = await supabase
    .from('data_rows')
    .select('date, data')
    .eq('org_id', orgId)
    .eq('upload_id', uploadId)
    .returns<DataRow[]>();

  if (rowsError || !rows || rows.length === 0) return;

  const sampleData = rows[0].data as Record<string, unknown>;
  const dataKeys = Object.keys(sampleData);

  // ── Revenue column resolution ──────────────────────────────────
  // Priority: "Total" > AI detection > hardcoded fallback
  let revenueCol = findColumn(dataKeys, TOTAL_CANDIDATES);

  if (!revenueCol && upload?.detection && typeof upload.detection === 'object') {
    const det = upload.detection as Record<string, unknown>;
    if (det.metrics && typeof det.metrics === 'object') {
      const m = det.metrics as Record<string, unknown>;
      const detectedRevCols = Array.isArray(m.revenueColumns) ? m.revenueColumns as string[] : [];
      for (const detCol of detectedRevCols) {
        const resolved = resolveRevenueHeader(detCol, dataKeys);
        if (resolved) { revenueCol = resolved; break; }
      }
    }
  }

  if (!revenueCol) {
    revenueCol = findColumn(dataKeys, REVENUE_CANDIDATES);
  }
  if (!revenueCol) return;

  // ── Detect date format ─────────────────────────────────────────
  const dateSamples: unknown[] = [];
  for (const row of rows.slice(0, 50)) {
    const record = row.data as Record<string, unknown>;
    dateSamples.push(row.date ?? findDateVal(record));
  }
  const dateFormat = detectDateFormat(dateSamples);
  const dayFirst = dateFormat !== 'MM/dd/yyyy';

  // ── Parse rows with robust dates ───────────────────────────────
  const parsedRows: { weekStart: string; data: Record<string, unknown>; revenue: number }[] = [];

  for (const row of rows) {
    const record = row.data as Record<string, unknown>;
    const rawDate = row.date ?? findDateVal(record);
    const parsed = parseDate(rawDate, dayFirst);
    if (!parsed) continue;

    const isoDate = parsed.toISOString().slice(0, 10);
    const weekStart = toWeekStart(isoDate);
    if (!weekStart) continue;

    const revenue = parseNumeric(record[revenueCol!]) ?? 0;
    parsedRows.push({ weekStart, data: record, revenue });
  }

  if (parsedRows.length === 0) return;

  const dimensions = await getDimensionColumns(orgId, uploadId);
  if (dimensions.length === 0) return;

  // ── Collect all weeks sorted ───────────────────────────────────
  const weekSet = new Set(parsedRows.map((r) => r.weekStart));
  const sortedWeeks = [...weekSet].sort();

  // Need at least 3 weeks for meaningful baselines
  const minWeeksForLeakage = 3;

  const upsertRows: {
    org_id: string;
    upload_id: string;
    metric: string;
    period: string;
    period_start: string;
    dimension_field: string;
    dimension_value: string;
    actual_value: number;
    expected_value: number;
    gap_value: number;
    gap_pct: number | null;
  }[] = [];

  for (const dim of dimensions) {
    // Build weekly actuals per dimension value
    const weeklyActuals = new Map<string, Map<string, number>>();

    for (const row of parsedRows) {
      const dimValue = String(row.data[dim.sourceColumn] ?? '').trim();
      if (!dimValue) continue;

      if (!weeklyActuals.has(dimValue)) weeklyActuals.set(dimValue, new Map());
      const weekMap = weeklyActuals.get(dimValue)!;
      weekMap.set(row.weekStart, (weekMap.get(row.weekStart) ?? 0) + row.revenue);
    }

    // Compute rolling baselines
    const baselines = computeRollingBaselines(weeklyActuals, sortedWeeks);

    for (const [dimValue, weekMap] of weeklyActuals) {
      const dimBaselines = baselines.get(dimValue);

      for (const [weekStart, actual] of weekMap) {
        const baselineInfo = dimBaselines?.get(weekStart);
        const weeksUsed = baselineInfo?.weeksUsed ?? 0;
        const baseline = baselineInfo?.baseline ?? 0;

        // If insufficient history, use max-in-week across dimension values as fallback
        let expectedValue: number;
        if (weeksUsed >= minWeeksForLeakage && baseline > 0) {
          expectedValue = baseline;
        } else {
          // Fallback: max actual across all dim values for this week
          let maxActual = 0;
          for (const [, wm] of weeklyActuals) {
            maxActual = Math.max(maxActual, wm.get(weekStart) ?? 0);
          }
          expectedValue = maxActual;
        }

        const gapValue = Math.max(expectedValue - actual, 0);
        const gapPct = expectedValue > 0
          ? Math.round((gapValue / expectedValue) * 10000) / 100
          : null;

        upsertRows.push({
          org_id: orgId,
          upload_id: uploadId,
          metric: 'revenue',
          period: 'weekly',
          period_start: weekStart,
          dimension_field: dim.sourceColumn,
          dimension_value: dimValue || '(blank)',
          actual_value: Math.round(actual * 100) / 100,
          expected_value: Math.round(expectedValue * 100) / 100,
          gap_value: Math.round(gapValue * 100) / 100,
          gap_pct: gapPct,
        });
      }
    }
  }

  if (upsertRows.length === 0) return;

  await supabase
    .from('performance_gaps')
    .delete()
    .eq('org_id', orgId)
    .eq('upload_id', uploadId);

  for (let i = 0; i < upsertRows.length; i += 500) {
    const batch = upsertRows.slice(i, i + 500);
    const { error } = await supabase.from('performance_gaps').insert(batch);
    if (error) {
      console.error('performance_gaps insert error:', error.message);
    }
  }

  // Update active targets with latest gap data
  try {
    const { data: activeTargets } = await supabase
      .from('action_targets')
      .select('id, dimension_field, dimension_value, baseline_gap, target_pct')
      .eq('org_id', orgId)
      .eq('status', 'active');

    if (activeTargets && activeTargets.length > 0) {
      for (const target of activeTargets) {
        const matchingGaps = upsertRows.filter(
          (r) =>
            r.dimension_field === target.dimension_field &&
            r.dimension_value === target.dimension_value,
        );
        if (matchingGaps.length === 0) continue;

        const sorted = matchingGaps.sort((a, b) =>
          b.period_start.localeCompare(a.period_start),
        );
        const latestGap = sorted[0].gap_value;
        const pctChange =
          (target.baseline_gap as number) > 0
            ? ((target.baseline_gap as number) - latestGap) /
              (target.baseline_gap as number) *
              100
            : 0;

        const isMet = pctChange >= (target.target_pct ?? 50);

        await supabase
          .from('action_targets')
          .update({
            current_gap: latestGap,
            current_pct_change: Math.round(pctChange * 100) / 100,
            last_checked_at: new Date().toISOString(),
            status: isMet ? 'completed' : 'active',
            completed_at: isMet ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', target.id);
      }
    }
  } catch (err) {
    console.error('Target update failed:', err);
  }
}

// Helper to find a date value in a data record
function findDateVal(record: Record<string, unknown>): unknown {
  const keys = Object.keys(record);
  const priority = ['date', 'time', 'timestamp', 'transaction date', 'sale date', 'created at'];
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
