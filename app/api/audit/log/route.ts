// API endpoint for recording audit events initiated from client-side flows.

import { NextRequest, NextResponse } from 'next/server';

import { logAuditEvent } from '@/lib/audit';
import { getOrgContext } from '@/lib/auth/org-context';

type ClientAuditPayload = {
  action: string;
  targetType?: string;
  targetId?: string;
  description: string;
  metadata?: Record<string, unknown>;
};

export async function POST(request: NextRequest) {
  try {
    const ctx = await getOrgContext();
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await ctx.supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', ctx.userId)
      .maybeSingle<{ email: string | null; full_name: string | null }>();

    const body = (await request.json()) as ClientAuditPayload;

    if (!body.action || !body.description) {
      return NextResponse.json({ error: 'Missing action or description' }, { status: 400 });
    }

    const ipHeader = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip');
    const ipAddress = ipHeader ? ipHeader.split(',')[0]?.trim() ?? null : null;

    await logAuditEvent({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      actorEmail: profile?.email ?? null,
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
