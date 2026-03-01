import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

type ProfileOrg = { org_id: string | null };

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
    if (!profile?.org_id) return NextResponse.json({ error: 'No org' }, { status: 400 });

    const { data: targets } = await supabase
      .from('action_targets')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false });

    return NextResponse.json({ targets: targets ?? [] });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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
    if (!profile?.org_id) return NextResponse.json({ error: 'No org' }, { status: 400 });

    const body = (await request.json()) as Record<string, unknown>;
    const {
      dimension_field,
      dimension_value,
      target_type,
      target_pct,
      target_value,
      baseline_gap,
      deadline,
      title,
      notes,
    } = body;

    if (!dimension_field || !dimension_value) {
      return NextResponse.json(
        { error: 'dimension_field and dimension_value required' },
        { status: 400 },
      );
    }

    const { data: target, error } = await supabase
      .from('action_targets')
      .insert({
        org_id: profile.org_id,
        created_by: user.id,
        dimension_field: String(dimension_field),
        dimension_value: String(dimension_value),
        target_type: target_type ?? 'reduce_gap',
        target_pct: target_pct ?? 50,
        target_value: target_value ?? null,
        baseline_gap: baseline_gap ?? 0,
        deadline: deadline ?? null,
        title: title ?? `Reduce gap for ${dimension_value}`,
        notes: notes ?? null,
        status: 'active',
        current_gap: baseline_gap ?? 0,
        current_pct_change: 0,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ target });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
