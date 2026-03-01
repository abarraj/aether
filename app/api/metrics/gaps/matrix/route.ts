// Performance gap matrix API — returns all gaps across all weeks and dimensions.

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

type ProfileOrg = { org_id: string | null };

type GapRow = {
  dimension_field: string;
  dimension_value: string;
  period_start: string;
  actual_value: number;
  expected_value: number;
  gap_value: number;
  gap_pct: number | null;
};

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .maybeSingle<ProfileOrg>();

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'No organization' }, { status: 400 });
    }

    const { data: rows, error } = await supabase
      .from('performance_gaps')
      .select(
        'dimension_field, dimension_value, period_start, actual_value, expected_value, gap_value, gap_pct',
      )
      .eq('org_id', profile.org_id)
      .eq('period', 'weekly')
      .order('period_start', { ascending: true })
      .returns<GapRow[]>();

    if (error) {
      return NextResponse.json(
        { weeks: [], dimensions: [], matrix: {}, entities: [], summary: null },
        { status: 200 },
      );
    }

    const allRows = rows ?? [];
    if (allRows.length === 0) {
      return NextResponse.json(
        {
          weeks: [],
          dimensions: [],
          matrix: {},
          entities: [],
          summary: {
            totalLeakage: 0,
            dimensionCount: 0,
            entityCount: 0,
            weekCount: 0,
            bestPerformer: null,
            worstPerformer: null,
          },
        },
        { status: 200 },
      );
    }

    const weekSet = new Set<string>();
    const dimFieldSet = new Set<string>();
    const dimValueSet = new Map<string, Set<string>>();

    for (const row of allRows) {
      weekSet.add(row.period_start);
      dimFieldSet.add(row.dimension_field);
      if (!dimValueSet.has(row.dimension_field))
        dimValueSet.set(row.dimension_field, new Set());
      dimValueSet.get(row.dimension_field)!.add(row.dimension_value);
    }

    const weeks = Array.from(weekSet).sort();
    const dimensions = Array.from(dimFieldSet).map((field) => ({
      field,
      values: Array.from(dimValueSet.get(field) ?? []).sort(),
    }));

    const matrix: Record<
      string,
      Record<
        string,
        Record<
          string,
          { actual: number; expected: number; gap: number; pct: number | null }
        >
      >
    > = {};

    for (const row of allRows) {
      if (!matrix[row.dimension_field]) matrix[row.dimension_field] = {};
      if (!matrix[row.dimension_field][row.dimension_value])
        matrix[row.dimension_field][row.dimension_value] = {};
      matrix[row.dimension_field][row.dimension_value][row.period_start] = {
        actual: Number(row.actual_value),
        expected: Number(row.expected_value),
        gap: Number(row.gap_value),
        pct: row.gap_pct != null ? Number(row.gap_pct) : null,
      };
    }

    const entityMap = new Map<
      string,
      {
        field: string;
        value: string;
        totalActual: number;
        totalExpected: number;
        totalGap: number;
        weekCount: number;
        avgGapPct: number | null;
        trend: number[];
      }
    >();

    for (const row of allRows) {
      const key = `${row.dimension_field}::${row.dimension_value}`;
      const existing = entityMap.get(key);
      if (existing) {
        existing.totalActual += Number(row.actual_value);
        existing.totalExpected += Number(row.expected_value);
        existing.totalGap += Number(row.gap_value);
        existing.weekCount++;
      } else {
        entityMap.set(key, {
          field: row.dimension_field,
          value: row.dimension_value,
          totalActual: Number(row.actual_value),
          totalExpected: Number(row.expected_value),
          totalGap: Number(row.gap_value),
          weekCount: 1,
          avgGapPct: null,
          trend: [],
        });
      }
    }

    const entities = Array.from(entityMap.values()).map((e) => {
      e.avgGapPct =
        e.totalExpected > 0
          ? Math.round((e.totalGap / e.totalExpected) * 10000) / 100
          : null;
      const dimData = matrix[e.field]?.[e.value] ?? {};
      e.trend = weeks.map((w) => dimData[w]?.gap ?? 0);
      return e;
    });

    entities.sort((a, b) => b.totalGap - a.totalGap);

    const totalLeakage = entities.reduce((sum, e) => sum + e.totalGap, 0);
    const bestPerformer =
      entities.length > 0 ? entities[entities.length - 1] : null;
    const worstPerformer = entities.length > 0 ? entities[0] : null;

    return NextResponse.json({
      weeks,
      dimensions,
      matrix,
      entities,
      summary: {
        totalLeakage: Math.round(totalLeakage * 100) / 100,
        dimensionCount: dimensions.length,
        entityCount: entities.length,
        weekCount: weeks.length,
        bestPerformer: bestPerformer
          ? {
              value: bestPerformer.value,
              field: bestPerformer.field,
              gap: bestPerformer.totalGap,
            }
          : null,
        worstPerformer: worstPerformer
          ? {
              value: worstPerformer.value,
              field: worstPerformer.field,
              gap: worstPerformer.totalGap,
            }
          : null,
      },
    });
  } catch (err) {
    console.error('Gaps matrix API error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
