// API endpoint for recording audit events initiated from client-side flows.

import { NextRequest, NextResponse } from 'next/server';

import { logAuditEvent } from '@/lib/audit';
import { createClient } from '@/lib/supabase/server';

type ClientAuditPayload = {
  action: string;
  targetType?: string;
  targetId?: string;
  description: string;
  metadata?: Record<string, unknown>;
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, org_id, email, full_name')
      .eq('id', user.id)
      .maybeSingle<{ id: string; org_id: string | null; email: string | null; full_name: string | null }>();

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'User has no organization' }, { status: 400 });
    }

    const body = (await request.json()) as ClientAuditPayload;

    if (!body.action || !body.description) {
      return NextResponse.json({ error: 'Missing action or description' }, { status: 400 });
    }

    const ipHeader = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip');
    const ipAddress = ipHeader ? ipHeader.split(',')[0]?.trim() ?? null : null;

    await logAuditEvent({
      orgId: profile.org_id,
      actorId: profile.id,
      actorEmail: profile.email ?? user.email ?? null,
      action: body.action,
      targetType: body.targetType ?? null,
      targetId: body.targetId ?? null,
      description: body.description,
      metadata: body.metadata ?? null,
      ipAddress,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to record audit event' }, { status: 500 });
  }
}

