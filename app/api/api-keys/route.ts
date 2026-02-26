// API endpoints for managing Aether API keys (list + create).

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { generateApiKey } from '@/lib/api-keys';
import { logAuditEvent } from '@/lib/audit';

type Permission = 'read' | 'write' | 'admin';

type ApiKeyRow = {
  id: string;
  org_id: string;
  name: string;
  key_prefix: string;
  permissions: Permission[] | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
};

export async function GET() {
  const supabase = await createClient();

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

  const { data } = await supabase
    .from('api_keys')
    .select(
      'id, org_id, name, key_prefix, permissions, created_at, last_used_at, expires_at, is_active',
    )
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })
    .returns<ApiKeyRow[]>();

  return NextResponse.json({ keys: data ?? [] });
}

type CreateBody = {
  name: string;
  permissions: Permission[];
  expiry: 'never' | '30d' | '90d' | '1y';
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = (await request.json()) as CreateBody;

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

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const allowedPermissions: Permission[] = ['read', 'write', 'admin'];
  const uniquePermissions = Array.from(
    new Set(
      (body.permissions ?? ['read']).filter((permission): permission is Permission =>
        allowedPermissions.includes(permission),
      ),
    ),
  );

  if (uniquePermissions.length === 0) {
    uniquePermissions.push('read');
  }

  const now = new Date();
  let expiresAt: Date | null = null;

  switch (body.expiry) {
    case '30d':
      expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      break;
    case '1y':
      expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      break;
    case 'never':
    default:
      expiresAt = null;
      break;
  }

  const { fullKey, prefix, hash } = generateApiKey();

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      org_id: profile.org_id,
      created_by: profile.id,
      name,
      key_prefix: prefix,
      key_hash: hash,
      permissions: uniquePermissions,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      is_active: true,
    })
    .select(
      'id, org_id, name, key_prefix, permissions, created_at, last_used_at, expires_at, is_active',
    )
    .maybeSingle<ApiKeyRow>();

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
  }

  const ipHeader =
    request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null;
  const ipAddress = ipHeader ? ipHeader.split(',')[0]?.trim() ?? null : null;

  await logAuditEvent({
    orgId: profile.org_id,
    actorId: profile.id,
    actorEmail: profile.email ?? user.email ?? null,
    action: 'api_key.create',
    targetType: 'api_key',
    targetId: data.id,
    description: `API key "${name}" created`,
    metadata: {
      permissions: uniquePermissions,
      expires_at: data.expires_at,
    },
    ipAddress,
  });

  return NextResponse.json({
    key: fullKey,
    apiKey: data,
  });
}

