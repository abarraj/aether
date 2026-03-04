// API endpoint to revoke an existing API key.

import { NextRequest, NextResponse } from 'next/server';

import { getOrgContext } from '@/lib/auth/org-context';
import { logAuditEvent } from '@/lib/audit';

type RevokeBody = {
  id: string;
};

export async function POST(request: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as RevokeBody;

  const { data: profile } = await ctx.supabase
    .from('profiles')
    .select('email')
    .eq('id', ctx.userId)
    .maybeSingle<{ email: string | null }>();

  if (!body.id) {
    return NextResponse.json({ error: 'Key id is required' }, { status: 400 });
  }

  const { data: key } = await ctx.supabase
    .from('api_keys')
    .select('id, org_id, name, is_active')
    .eq('id', body.id)
    .eq('org_id', ctx.orgId)
    .maybeSingle<{ id: string; org_id: string; name: string; is_active: boolean }>();

  if (!key) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!key.is_active) {
    return NextResponse.json({ success: true });
  }

  const { error } = await ctx.supabase
    .from('api_keys')
    .update({ is_active: false })
    .eq('id', key.id)
    .eq('org_id', ctx.orgId);

  if (error) {
    return NextResponse.json({ error: 'Failed to revoke key' }, { status: 500 });
  }

  const ipHeader =
    request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null;
  const ipAddress = ipHeader ? ipHeader.split(',')[0]?.trim() ?? null : null;

  await logAuditEvent({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorEmail: profile?.email ?? null,
    action: 'api_key.revoke',
    targetType: 'api_key',
    targetId: key.id,
    description: `API key "${key.name}" revoked`,
    metadata: {},
    ipAddress,
  });

  return NextResponse.json({ success: true });
}
