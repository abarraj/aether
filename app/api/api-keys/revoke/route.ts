// API endpoint to revoke an existing API key.

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit';

type RevokeBody = {
  id: string;
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = (await request.json()) as RevokeBody;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id, email')
    .eq('id', user.id)
    .maybeSingle<{ id: string; org_id: string | null; email: string | null }>();

  if (!profile?.org_id) {
    return NextResponse.json({ error: 'User has no organization' }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: 'Key id is required' }, { status: 400 });
  }

  const { data: key } = await supabase
    .from('api_keys')
    .select('id, org_id, name, is_active')
    .eq('id', body.id)
    .eq('org_id', profile.org_id)
    .maybeSingle<{ id: string; org_id: string; name: string; is_active: boolean }>();

  if (!key) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!key.is_active) {
    return NextResponse.json({ success: true });
  }

  const { error } = await supabase
    .from('api_keys')
    .update({ is_active: false })
    .eq('id', key.id)
    .eq('org_id', profile.org_id);

  if (error) {
    return NextResponse.json({ error: 'Failed to revoke key' }, { status: 500 });
  }

  const ipHeader =
    request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null;
  const ipAddress = ipHeader ? ipHeader.split(',')[0]?.trim() ?? null : null;

  await logAuditEvent({
    orgId: profile.org_id,
    actorId: profile.id,
    actorEmail: profile.email ?? user.email ?? null,
    action: 'api_key.revoke',
    targetType: 'api_key',
    targetId: key.id,
    description: `API key "${key.name}" revoked`,
    metadata: {},
    ipAddress,
  });

  return NextResponse.json({ success: true });
}

