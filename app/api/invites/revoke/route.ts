import { NextResponse } from 'next/server';

import { requirePermission } from '@/lib/auth/org-context';

export async function POST(req: Request) {
  const result = await requirePermission('manage_team');
  if (result instanceof NextResponse) return result;
  const ctx = result;

  const body = await req.json();
  const inviteId = String(body.inviteId ?? '');
  if (!inviteId) {
    return NextResponse.json({ error: 'Invite ID is required' }, { status: 400 });
  }

  const { error } = await ctx.supabase
    .from('invites')
    .delete()
    .eq('id', inviteId)
    .eq('org_id', ctx.orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
