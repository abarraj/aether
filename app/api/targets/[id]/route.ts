import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

type ProfileOrg = { org_id: string | null };

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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
    if (!profile?.org_id) return NextResponse.json({ error: 'No org' }, { status: 400 });

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

    const { data: target, error } = await supabase
      .from('action_targets')
      .update(updateFields)
      .eq('id', id)
      .eq('org_id', profile.org_id)
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
    if (!profile?.org_id) return NextResponse.json({ error: 'No org' }, { status: 400 });

    await supabase
      .from('action_targets')
      .delete()
      .eq('id', id)
      .eq('org_id', profile.org_id);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
