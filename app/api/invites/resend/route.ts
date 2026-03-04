import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { generateTokenPair, buildInviteLink, INVITE_TTL_MS } from '@/lib/invites';

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.org_id) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('invites')
    .select('id, role')
    .eq('org_id', profile.org_id)
    .eq('email', email)
    .is('accepted_at', null)
    .maybeSingle();

  const { rawToken, tokenHash } = generateTokenPair();

  let inviteLink: string;
  try {
    inviteLink = buildInviteLink(rawToken);
  } catch {
    return NextResponse.json({ error: 'Missing NEXT_PUBLIC_APP_URL' }, { status: 500 });
  }

  const newExpiry = new Date(Date.now() + INVITE_TTL_MS).toISOString();

  if (existing) {
    const { error } = await supabase
      .from('invites')
      .update({ token_hash: tokenHash, expires_at: newExpiry })
      .eq('id', existing.id)
      .eq('org_id', profile.org_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    const { error } = await supabase.from('invites').insert({
      org_id: profile.org_id,
      email,
      role: 'viewer',
      token_hash: tokenHash,
      invited_by: user.id,
      expires_at: newExpiry,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ inviteLink });
}
