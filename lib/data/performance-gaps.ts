// Smart performance gap engine.
// Auto-detects dimensions from entity_types (ontology detection results)
// and computes actual vs expected revenue by dimension × week.

import { parseISO, startOfISOWeek } from 'date-fns';
import { createClient } from '@/lib/supabase/server';

type DataRow = {
  date: string | null;
  data: Record<string, unknown>;
};

function normKey(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseNum(val: unknown): number {
  if (val == null) return 0;
  const n = typeof val === 'number' ? val : Number(String(val).replace(/[,$]/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

function toWeekStart(dateStr: string): string | null {
  try {
    return startOfISOWeek(parseISO(dateStr)).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

// Find the revenue column by scanning data keys
const REVENUE_CANDIDATES = [
  'revenue',
  'amount',
  'total',
  'net',
  'gross',
  'sales',
  'income',
  'total_revenue',
  'revenue_per_class',
  'price',
];

const EXPECTED_CANDIDATES = [
  'target_revenue',
  'expected_revenue',
  'max_possible_revenue',
  'target',
  'expected',
  'budget',
  'capacity_revenue',
  'max_revenue',
];

function findColumn(dataKeys: string[], candidates: string[]): string | null {
  const lowerKeys = dataKeys.map((k) => normKey(k));
  for (const candidate of candidates) {
    const idx = lowerKeys.indexOf(candidate);
    if (idx !== -1) return dataKeys[idx]; // return original case
  }
  return null;
}

// Find dimension columns from entity_types that were auto-detected
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

  // Get a sample data row to check which columns exist
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
    // Use stored source_column if available
    const etWithSource = et as { slug: string; name: string; source_column?: string | null };
    if (etWithSource.source_column && lowerKeys.includes(normKey(etWithSource.source_column))) {
      const originalCol = dataKeys[lowerKeys.indexOf(normKey(etWithSource.source_column))];
      const sampleVal = sampleData[originalCol];
      if (
        sampleVal != null &&
        typeof sampleVal === 'string' &&
        sampleVal.length > 0
      ) {
        result.push({
          slug: et.slug,
          name: et.name,
          sourceColumn: originalCol,
        });
        continue;
      }
    }

    // Fallback: heuristic matching
    const slugNorm = normKey(et.slug.replace(/_/g, ' '));
    const slugUnderscore = et.slug.toLowerCase();

    let matchedCol: string | null = null;

    const exactIdx = lowerKeys.indexOf(slugUnderscore);
    if (exactIdx !== -1) {
      matchedCol = dataKeys[exactIdx];
    }

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
      if (
        sampleVal != null &&
        typeof sampleVal === 'string' &&
        sampleVal.length > 0
      ) {
        result.push({ slug: et.slug, name: et.name, sourceColumn: matchedCol });
      }
    }
  }

  return result;
}

export async function computePerformanceGaps(
  orgId: string,
  uploadId: string,
): Promise<void> {
  const supabase = await createClient();

  const { data: rows, error: rowsError } = await supabase
    .from('data_rows')
    .select('date, data')
    .eq('org_id', orgId)
    .eq('upload_id', uploadId)
    .returns<DataRow[]>();

  if (rowsError || !rows || rows.length === 0) return;

  const rowsWithDate = rows.filter((r) => r.date != null && r.date.length > 0);
  if (rowsWithDate.length === 0) return;

  const sampleData = rowsWithDate[0].data as Record<string, unknown>;
  const dataKeys = Object.keys(sampleData);
  const revenueCol = findColumn(dataKeys, REVENUE_CANDIDATES);
  if (!revenueCol) return;

  const expectedCol = findColumn(dataKeys, EXPECTED_CANDIDATES);

  const dimensions = await getDimensionColumns(orgId, uploadId);
  if (dimensions.length === 0) return;

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
    const groups = new Map<string, { actual: number; expected: number }>();

    for (const row of rowsWithDate) {
      const weekStart = toWeekStart(row.date!);
      if (!weekStart) continue;

      const data = row.data as Record<string, unknown>;
      const dimValue = String(data[dim.sourceColumn] ?? '').trim();
      if (!dimValue) continue;

      const key = `${weekStart}\0${dimValue}`;
      const actual = parseNum(data[revenueCol]);
      const expected = expectedCol ? parseNum(data[expectedCol]) : 0;

      const existing = groups.get(key);
      if (existing) {
        existing.actual += actual;
        if (expectedCol) existing.expected += expected;
      } else {
        groups.set(key, { actual, expected: expectedCol ? expected : 0 });
      }
    }

    const byWeek = new Map<
      string,
      Map<string, { actual: number; expected: number }>
    >();
    for (const [key, vals] of groups) {
      const [weekStart, dimValue] = key.split('\0');
      let weekMap = byWeek.get(weekStart);
      if (!weekMap) {
        weekMap = new Map();
        byWeek.set(weekStart, weekMap);
      }
      weekMap.set(dimValue, vals);
    }

    for (const [weekStart, weekMap] of byWeek) {
      const maxActual = Math.max(
        ...Array.from(weekMap.values()).map((v) => v.actual),
        0,
      );

      for (const [dimValue, vals] of weekMap) {
        let expectedValue = vals.expected;
        if (!expectedCol || expectedValue === 0) {
          expectedValue = maxActual;
        }

        const gapValue = Math.max(expectedValue - vals.actual, 0);
        const gapPct =
          expectedValue > 0
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
          actual_value: Math.round(vals.actual * 100) / 100,
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
}
