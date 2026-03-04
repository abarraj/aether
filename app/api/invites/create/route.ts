import { NextResponse } from 'next/server';

import { requirePermission } from '@/lib/auth/org-context';
import {
  generateTokenPair,
  buildInviteLink,
  INVITE_TTL_MS,
  ALLOWED_INVITE_ROLES,
} from '@/lib/invites';

export async function POST(req: Request) {
  const result = await requirePermission('manage_team');
  if (result instanceof NextResponse) return result;
  const ctx = result;

  const body = await req.json();
  const email = String(body.email ?? '').trim().toLowerCase();
  const role = String(body.role ?? 'viewer').toLowerCase();

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }
  if (!(ALLOWED_INVITE_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json(
      { error: `Role must be one of: ${ALLOWED_INVITE_ROLES.join(', ')}` },
      { status: 400 },
    );
  }

  const { rawToken, tokenHash } = generateTokenPair();

  let inviteLink: string;
  try {
    inviteLink = buildInviteLink(rawToken);
  } catch {
    return NextResponse.json({ error: 'Missing NEXT_PUBLIC_APP_URL' }, { status: 500 });
  }

  const { data: invite, error } = await ctx.supabase
    .from('invites')
    .insert({
      org_id: ctx.orgId,
      email,
      role,
      token_hash: tokenHash,
      invited_by: ctx.userId,
      expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
    })
    .select('id, org_id, email, role, created_at, expires_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ invite, inviteLink });
}
