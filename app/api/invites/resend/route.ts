import { NextResponse } from 'next/server';

import { requirePermission } from '@/lib/auth/org-context';
import { generateTokenPair, buildInviteLink, INVITE_TTL_MS } from '@/lib/invites';

export async function POST(req: Request) {
  const result = await requirePermission('manage_team');
  if (result instanceof NextResponse) return result;
  const ctx = result;

  const body = await req.json();
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const { data: existing } = await ctx.supabase
    .from('invites')
    .select('id, role')
    .eq('org_id', ctx.orgId)
    .eq('email', email)
    .is('accepted_at', null)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'No pending invite found for this email' }, { status: 404 });
  }

  const { rawToken, tokenHash } = generateTokenPair();

  let inviteLink: string;
  try {
    inviteLink = buildInviteLink(rawToken);
  } catch {
    return NextResponse.json({ error: 'Missing NEXT_PUBLIC_APP_URL' }, { status: 500 });
  }

  const newExpiry = new Date(Date.now() + INVITE_TTL_MS).toISOString();

  const { error } = await ctx.supabase
    .from('invites')
    .update({ token_hash: tokenHash, expires_at: newExpiry })
    .eq('id', existing.id)
    .eq('org_id', ctx.orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ inviteLink });
}
