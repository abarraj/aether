import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const inviteId = String(body.inviteId ?? '');
  if (!inviteId) {
    return NextResponse.json({ error: 'Invite ID is required' }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.org_id) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 400 });
  }

  const { error } = await supabase
    .from('invites')
    .delete()
    .eq('id', inviteId)
    .eq('org_id', profile.org_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
