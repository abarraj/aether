// API routes for metric-based targets.
// GET: list all metric targets for the org (any role).
// POST: create a new target (requires manage_targets permission).

import { NextRequest, NextResponse } from 'next/server';

import { getOrgContext, requirePermission } from '@/lib/auth/org-context';

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

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { data: targets, error } = await ctx.supabase
    .from('targets')
    .select(
      'id, metric_key, dimension_field, dimension_value, period, target_value, comparator, label, status, current_value, current_met, last_evaluated_at, created_at',
    )
    .eq('org_id', ctx.orgId)
    .order('created_at', { ascending: false })
    .returns<TargetRow[]>();

  if (error) {
    return NextResponse.json({ error: 'Failed to load targets.' }, { status: 500 });
  }

  return NextResponse.json({ targets: targets ?? [] });
}

export async function POST(request: NextRequest) {
  const result = await requirePermission('manage_targets');
  if (result instanceof NextResponse) return result;
  const ctx = result;

  const body = (await request.json()) as {
    metric_key?: string;
    dimension_field?: string;
    dimension_value?: string;
    period?: string;
    target_value?: number;
    comparator?: string;
    label?: string;
  };

  const { metric_key, target_value } = body;

  if (!metric_key || target_value === undefined || target_value === null) {
    return NextResponse.json(
      { error: 'metric_key and target_value are required.' },
      { status: 400 },
    );
  }

  const validComparators = ['gte', 'lte', 'eq'];
  const comparator = body.comparator ?? 'gte';
  if (!validComparators.includes(comparator)) {
    return NextResponse.json(
      { error: `comparator must be one of: ${validComparators.join(', ')}` },
      { status: 400 },
    );
  }

  const validPeriods = ['daily', 'weekly', 'monthly'];
  const period = body.period ?? 'monthly';
  if (!validPeriods.includes(period)) {
    return NextResponse.json(
      { error: `period must be one of: ${validPeriods.join(', ')}` },
      { status: 400 },
    );
  }

  const comparatorSymbol = comparator === 'gte' ? '>=' : comparator === 'lte' ? '<=' : '=';
  const defaultLabel = body.dimension_value
    ? `${metric_key} ${comparatorSymbol} ${target_value} for ${body.dimension_value} (${period})`
    : `${metric_key} ${comparatorSymbol} ${target_value} (${period})`;

  const { data: target, error } = await ctx.supabase
    .from('targets')
    .insert({
      org_id: ctx.orgId,
      metric_key,
      dimension_field: body.dimension_field ?? null,
      dimension_value: body.dimension_value ?? null,
      period,
      target_value: target_value,
      comparator,
      label: body.label ?? defaultLabel,
      created_by: ctx.userId,
      status: 'active',
    })
    .select()
    .maybeSingle<TargetRow>();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'An active target already exists for this metric, dimension, and period.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'Failed to create target.' }, { status: 500 });
  }

  return NextResponse.json({ target }, { status: 201 });
}
