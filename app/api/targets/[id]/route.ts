import { NextRequest, NextResponse } from 'next/server';

import { getOrgContext } from '@/lib/auth/org-context';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ctx = await getOrgContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as Record<string, unknown>;
    const { status, notes, title } = body;

    const updateFields: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (status) updateFields.status = status;
    if (notes !== undefined) updateFields.notes = notes;
    if (title !== undefined) updateFields.title = title;
    if (status === 'completed') {
      updateFields.completed_at = new Date().toISOString();
    }

    const { data: target, error } = await ctx.supabase
      .from('action_targets')
      .update(updateFields)
      .eq('id', id)
      .eq('org_id', ctx.orgId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ target });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ctx = await getOrgContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ctx.supabase
      .from('action_targets')
      .delete()
      .eq('id', id)
      .eq('org_id', ctx.orgId);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
