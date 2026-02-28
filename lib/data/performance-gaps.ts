// Deterministic weekly revenue gap engine.
// Computes actual vs expected by dimension and upserts into performance_gaps.

import { parseISO, startOfISOWeek } from 'date-fns';

import { createClient } from '@/lib/supabase/server';

type UploadRow = {
  id: string;
  org_id: string;
  column_mapping: Record<string, string> | null;
  data_type: string;
};

type DataRow = {
  date: string | null;
  data: Record<string, unknown>;
};

function toWeekStart(dateStr: string): string | null {
  try {
    const d = parseISO(dateStr);
    const weekStart = startOfISOWeek(d);
    return weekStart.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function parseNum(val: unknown): number {
  if (val == null) return 0;
  const n = typeof val === 'number' ? val : Number(String(val).replace(/[,]/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

export async function computePerformanceGaps(orgId: string, uploadId: string): Promise<void> {
  const supabase = await createClient();

  const { data: upload, error: uploadError } = await supabase
    .from('uploads')
    .select('id, org_id, column_mapping, data_type')
    .eq('id', uploadId)
    .eq('org_id', orgId)
    .maybeSingle<UploadRow>();

  if (uploadError || !upload) return;

  const mapping = (upload.column_mapping ?? {}) as Record<string, string>;
  const revenueHeader = Object.entries(mapping).find(([, role]) => role === 'revenue')?.[0];
  const expectedHeader = Object.entries(mapping).find(([, role]) => role === 'expected')?.[0];
  const dimensionHeaders = Object.entries(mapping).filter(([, role]) => role === 'dimension');

  if (!revenueHeader || dimensionHeaders.length !== 1) return;

  const dimensionHeader = dimensionHeaders[0][0];

  const { data: rows, error: rowsError } = await supabase
    .from('data_rows')
    .select('date, data')
    .eq('org_id', orgId)
    .eq('upload_id', uploadId)
    .returns<DataRow[]>();

  if (rowsError || !rows || rows.length === 0) return;

  const rowsWithDate = rows.filter((r) => r.date != null && r.date.length > 0);
  if (rowsWithDate.length === 0) return;

  type GroupKey = string;
  const groups = new Map<GroupKey, { actual: number; expected: number }>();

  for (const row of rowsWithDate) {
    const weekStart = toWeekStart(row.date!);
    if (!weekStart) continue;

    const data = (row.data ?? {}) as Record<string, unknown>;
    const dimensionValue = String(data[dimensionHeader] ?? '').trim();
    const key: GroupKey = `${weekStart}\0${dimensionValue}`;

    const actual = parseNum(data[revenueHeader]);
    const expected = expectedHeader ? parseNum(data[expectedHeader]) : 0;

    const existing = groups.get(key);
    if (existing) {
      existing.actual += actual;
      if (expectedHeader) existing.expected += expected;
    } else {
      groups.set(key, { actual, expected: expectedHeader ? expected : 0 });
    }
  }

  const byWeek = new Map<string, Map<string, { actual: number; expected: number }>>();
  for (const [key, vals] of groups) {
    const [weekStart, dimensionValue] = key.split('\0');
    let weekMap = byWeek.get(weekStart);
    if (!weekMap) {
      weekMap = new Map();
      byWeek.set(weekStart, weekMap);
    }
    weekMap.set(dimensionValue, vals);
  }

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

  for (const [weekStart, weekMap] of byWeek) {
    const maxActualInWeek = Math.max(...Array.from(weekMap.values()).map((v) => v.actual), 0);

    for (const [dimensionValue, vals] of weekMap) {
      let expectedValue = vals.expected;
      if (!expectedHeader || expectedValue === 0) {
        expectedValue = maxActualInWeek;
      }

      const gapValue = Math.max(expectedValue - vals.actual, 0);
      const gapPct =
        expectedValue > 0 ? Math.round((gapValue / expectedValue) * 10000) / 100 : null;

      upsertRows.push({
        org_id: orgId,
        upload_id: uploadId,
        metric: 'revenue',
        period: 'weekly',
        period_start: weekStart,
        dimension_field: dimensionHeader,
        dimension_value: dimensionValue || '(blank)',
        actual_value: vals.actual,
        expected_value: expectedValue,
        gap_value: gapValue,
        gap_pct: gapPct,
      });
    }
  }

  if (upsertRows.length === 0) return;

  await supabase.from('performance_gaps').upsert(upsertRows, {
    onConflict: 'org_id,upload_id,metric,period,period_start,dimension_field,dimension_value',
  });
}
