// Returns transparency data for a specific metric:
// formula, source datasets, row count, dataset version, computed_at.

import { NextRequest, NextResponse } from 'next/server';

import { getOrgContext } from '@/lib/auth/org-context';

interface MetricDefinitionRow {
  metric_key: string;
  name: string;
  formula: string;
  description: string | null;
  category: string;
  unit: string;
  is_derived: boolean;
  source_metrics: string[] | null;
}

interface MetricSnapshotRow {
  metric_key: string;
  period_start: string;
  period_end: string;
  value: number | null;
  dataset_version: string | null;
  source_uploads: string[] | null;
  computed_at: string;
  compute_run_id: string | null;
}

interface UploadSourceRow {
  id: string;
  file_name: string;
  data_type: string;
  row_count: number | null;
  created_at: string;
  stream_id: string | null;
}

interface StreamNameRow {
  id: string;
  name: string;
}

interface ComputeRunRow {
  id: string;
  rows_processed: number | null;
  duration_ms: number | null;
  finished_at: string | null;
}

export async function GET(request: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const metricKey = searchParams.get('metric_key');
  const period = searchParams.get('period') ?? 'daily';
  const periodStart = searchParams.get('period_start');

  if (!metricKey) {
    return NextResponse.json({ error: 'metric_key is required.' }, { status: 400 });
  }

  // 1. Get metric definition (system or org-specific)
  const { data: definitions } = await ctx.supabase
    .from('metric_definitions')
    .select('metric_key, name, formula, description, category, unit, is_derived, source_metrics')
    .or(`org_id.is.null,org_id.eq.${ctx.orgId}`)
    .eq('metric_key', metricKey)
    .order('org_id', { ascending: false, nullsFirst: false })
    .limit(1)
    .returns<MetricDefinitionRow[]>();

  const definition = definitions?.[0] ?? null;

  // 2. Get the specific metric snapshot (or latest if no period_start)
  let snapshotQuery = ctx.supabase
    .from('metric_snapshots')
    .select('metric_key, period_start, period_end, value, dataset_version, source_uploads, computed_at, compute_run_id')
    .eq('org_id', ctx.orgId)
    .eq('metric_key', metricKey)
    .eq('period', period)
    .eq('dimensions', '{}');

  if (periodStart) {
    snapshotQuery = snapshotQuery.eq('period_start', periodStart);
  } else {
    snapshotQuery = snapshotQuery.order('period_start', { ascending: false });
  }

  const { data: snapshots } = await snapshotQuery
    .limit(1)
    .returns<MetricSnapshotRow[]>();

  const snapshot = snapshots?.[0] ?? null;

  // 3. Get source upload details
  let sources: {
    id: string;
    fileName: string;
    dataType: string;
    rowCount: number | null;
    uploadedAt: string;
    streamName: string | null;
  }[] = [];

  if (snapshot?.source_uploads && snapshot.source_uploads.length > 0) {
    const { data: uploads } = await ctx.supabase
      .from('uploads')
      .select('id, file_name, data_type, row_count, created_at, stream_id')
      .in('id', snapshot.source_uploads)
      .eq('org_id', ctx.orgId)
      .returns<UploadSourceRow[]>();

    // Get stream names for uploads that have stream_id
    const streamIds = (uploads ?? [])
      .map((u) => u.stream_id)
      .filter((id): id is string => id !== null);

    let streamNames = new Map<string, string>();
    if (streamIds.length > 0) {
      const { data: streams } = await ctx.supabase
        .from('data_streams')
        .select('id, name')
        .in('id', streamIds)
        .returns<StreamNameRow[]>();

      streamNames = new Map((streams ?? []).map((s) => [s.id, s.name]));
    }

    sources = (uploads ?? []).map((u) => ({
      id: u.id,
      fileName: u.file_name,
      dataType: u.data_type,
      rowCount: u.row_count,
      uploadedAt: u.created_at,
      streamName: u.stream_id ? streamNames.get(u.stream_id) ?? null : null,
    }));
  }

  // 4. Get compute run details
  let computeRun: {
    rowsProcessed: number | null;
    durationMs: number | null;
    finishedAt: string | null;
  } | null = null;

  if (snapshot?.compute_run_id) {
    const { data: run } = await ctx.supabase
      .from('compute_runs')
      .select('id, rows_processed, duration_ms, finished_at')
      .eq('id', snapshot.compute_run_id)
      .eq('org_id', ctx.orgId)
      .maybeSingle<ComputeRunRow>();

    if (run) {
      computeRun = {
        rowsProcessed: run.rows_processed,
        durationMs: run.duration_ms,
        finishedAt: run.finished_at,
      };
    }
  }

  // 5. Count total contributing rows
  const totalRows = sources.reduce((sum, s) => sum + (s.rowCount ?? 0), 0);

  // 6. Data coverage assessment
  let coverageNote: string | null = null;
  if (snapshot && period === 'weekly') {
    // Check how many daily snapshots exist for this week
    const { count } = await ctx.supabase
      .from('metric_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', ctx.orgId)
      .eq('metric_key', metricKey)
      .eq('period', 'daily')
      .gte('period_start', snapshot.period_start)
      .lte('period_start', snapshot.period_end);

    if (count !== null && count < 7) {
      coverageNote = `Partial data: ${count} of 7 days have recorded values for this week.`;
    }
  }

  return NextResponse.json({
    definition,
    snapshot: snapshot
      ? {
          periodStart: snapshot.period_start,
          periodEnd: snapshot.period_end,
          value: snapshot.value,
          computedAt: snapshot.computed_at,
          datasetVersion: snapshot.dataset_version,
        }
      : null,
    sources,
    computeRun,
    totalRows,
    coverageNote,
  });
}
