// Weekly performance gap metrics API.

import { NextResponse } from 'next/server';
import { startOfISOWeek } from 'date-fns';

import { createClient } from '@/lib/supabase/server';

type ProfileOrg = {
  org_id: string | null;
};

type GapRow = {
  dimension_field: string;
  dimension_value: string;
  gap_value: number;
  gap_pct: number | null;
  actual_value: number;
  expected_value: number;
};

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .maybeSingle<ProfileOrg>();

    if (profileError || !profile?.org_id) {
      return NextResponse.json(
        { error: 'User is not associated with an organization.' },
        { status: 400 },
      );
    }

    const orgId = profile.org_id;

    // Get the most recent week that has gap data (not necessarily current week)
    const { data: latestWeek } = await supabase
      .from('performance_gaps')
      .select('period_start')
      .eq('org_id', orgId)
      .eq('period', 'weekly')
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle<{ period_start: string }>();

    const weekStart =
      latestWeek?.period_start ??
      startOfISOWeek(new Date()).toISOString().slice(0, 10);

    const { data: rows, error: rowsError } = await supabase
      .from('performance_gaps')
      .select('dimension_field, dimension_value, gap_value, gap_pct, actual_value, expected_value')
      .eq('org_id', orgId)
      .eq('period', 'weekly')
      .eq('period_start', weekStart)
      .order('gap_value', { ascending: false })
      .returns<GapRow[]>();

    if (rowsError) {
      return NextResponse.json(
        { weekStart, totalLeakage: 0, topLeakage: [] },
        { status: 200 },
      );
    }

    const allRows = rows ?? [];
    const totalLeakage = allRows.reduce((sum, r) => sum + Number(r.gap_value ?? 0), 0);
    const topLeakage = allRows.slice(0, 5);

    return NextResponse.json(
      {
        weekStart,
        totalLeakage,
        topLeakage,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('Weekly gaps API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch weekly gaps.' },
      { status: 500 },
    );
  }
}
