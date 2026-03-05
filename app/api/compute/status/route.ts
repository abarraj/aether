// Returns the latest compute run status for the current org.
// Dashboard polls this to show "Computing..." or "Last computed 2m ago".

import { NextResponse } from 'next/server';

import { getOrgContext } from '@/lib/auth/org-context';

interface ComputeRunRow {
  id: string;
  status: string;
  trigger: string;
  metrics_computed: number | null;
  rows_processed: number | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
}

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { data: latestRun, error } = await ctx.supabase
    .from('compute_runs')
    .select(
      'id, status, trigger, metrics_computed, rows_processed, started_at, finished_at, duration_ms, error_message, created_at',
    )
    .eq('org_id', ctx.orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<ComputeRunRow>();

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch compute status.' }, { status: 500 });
  }

  return NextResponse.json({ run: latestRun ?? null });
}
