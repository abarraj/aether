// API routes for a single metric target.
// PATCH: update a target (requires manage_targets permission).
// DELETE: soft-delete a target (requires manage_targets permission).

import { NextRequest, NextResponse } from 'next/server';

import { requirePermission } from '@/lib/auth/org-context';

interface TargetRow {
  id: string;
  metric_key: string;
  dimension_field: string | null;
  dimension_value: string | null;
  period: string;
  target_value: number;
  comparator: string;
  label: string | null;
  status: string;
  current_value: number | null;
  current_met: boolean;
  last_evaluated_at: string | null;
  created_at: string;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requirePermission('manage_targets');
  if (result instanceof NextResponse) return result;
  const ctx = result;
  const { id } = await params;

  const body = (await request.json()) as {
    target_value?: number;
    comparator?: string;
    period?: string;
    label?: string;
    status?: string;
  };

  // Build update payload — only allow safe fields
  const update: Record<string, unknown> = {};

  if (body.target_value !== undefined && body.target_value !== null) {
    update.target_value = body.target_value;
  }

  if (body.comparator !== undefined) {
    const validComparators = ['gte', 'lte', 'eq'];
    if (!validComparators.includes(body.comparator)) {
      return NextResponse.json(
        { error: `comparator must be one of: ${validComparators.join(', ')}` },
        { status: 400 },
      );
    }
    update.comparator = body.comparator;
  }

  if (body.period !== undefined) {
    const validPeriods = ['daily', 'weekly', 'monthly'];
    if (!validPeriods.includes(body.period)) {
      return NextResponse.json(
        { error: `period must be one of: ${validPeriods.join(', ')}` },
        { status: 400 },
      );
    }
    update.period = body.period;
  }

  if (body.label !== undefined) {
    update.label = body.label;
  }

  if (body.status !== undefined) {
    const validStatuses = ['active', 'paused', 'completed'];
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json(
        { error: `status must be one of: active, paused, completed` },
        { status: 400 },
      );
    }
    update.status = body.status;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: 'No valid fields to update.' },
      { status: 400 },
    );
  }

  update.updated_at = new Date().toISOString();

  const { data: target, error } = await ctx.supabase
    .from('targets')
    .update(update)
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .select()
    .maybeSingle<TargetRow>();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'An active target already exists for this metric, dimension, and period.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'Failed to update target.' }, { status: 500 });
  }

  if (!target) {
    return NextResponse.json({ error: 'Target not found.' }, { status: 404 });
  }

  return NextResponse.json({ target });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requirePermission('manage_targets');
  if (result instanceof NextResponse) return result;
  const ctx = result;
  const { id } = await params;

  // Soft-delete by setting status to 'completed'
  const { data: target, error } = await ctx.supabase
    .from('targets')
    .update({
      status: 'completed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .select('id, status')
    .maybeSingle<{ id: string; status: string }>();

  if (error) {
    return NextResponse.json({ error: 'Failed to delete target.' }, { status: 500 });
  }

  if (!target) {
    return NextResponse.json({ error: 'Target not found.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
