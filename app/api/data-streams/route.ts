// API route for listing data streams and updating stream lifecycle status.

import { NextRequest, NextResponse } from 'next/server';

import { getOrgContext } from '@/lib/auth/org-context';
import { runComputeJob } from '@/lib/data/compute-engine';

interface StreamRow {
  id: string;
  name: string;
  source_type: string;
  data_type: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { data: streams, error } = await ctx.supabase
    .from('data_streams')
    .select('id, name, source_type, data_type, status, created_at, updated_at')
    .eq('org_id', ctx.orgId)
    .order('created_at', { ascending: false })
    .returns<StreamRow[]>();

  if (error) {
    return NextResponse.json({ error: 'Failed to load streams.' }, { status: 500 });
  }

  return NextResponse.json({ streams: streams ?? [] });
}

export async function PATCH(request: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const body = (await request.json()) as { id?: string; status?: string };
  const { id, status } = body;

  if (!id || !status) {
    return NextResponse.json({ error: 'id and status are required.' }, { status: 400 });
  }

  const validStatuses = ['active', 'paused', 'archived'];
  if (!validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${validStatuses.join(', ')}` },
      { status: 400 },
    );
  }

  const { error } = await ctx.supabase
    .from('data_streams')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', ctx.orgId);

  if (error) {
    return NextResponse.json({ error: 'Failed to update stream.' }, { status: 500 });
  }

  // Recompute metrics since active/paused status affects aggregation
  try {
    await runComputeJob(ctx.orgId, 'stream_change', id);
  } catch {
    // Non-blocking — stream status is updated even if recompute fails
  }

  return NextResponse.json({ success: true });
}
