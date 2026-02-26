// Server-side audit logging utilities for Aether.

import { createClient } from '@/lib/supabase/server';

export type AuditAction =
  | 'user.login'
  | 'user.signup'
  | 'user.invite'
  | 'data.upload'
  | 'data.delete'
  | 'settings.update'
  | 'org.update'
  | 'ai.query'
  | 'alert.dismiss'
  | 'member.remove'
  | 'role.change'
  | 'export.download'
  | 'api_key.create'
  | 'api_key.revoke';

export interface AuditEventParams {
  orgId: string;
  action: AuditAction | string;
  description: string;
  actorId?: string | null;
  actorEmail?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

export async function logAuditEvent(params: AuditEventParams): Promise<void> {
  const supabase = await createClient();

  await supabase.from('audit_log').insert({
    org_id: params.orgId,
    actor_id: params.actorId ?? null,
    actor_email: params.actorEmail ?? null,
    action: params.action,
    target_type: params.targetType ?? null,
    target_id: params.targetId ?? null,
    description: params.description,
    metadata: params.metadata ?? null,
    ip_address: params.ipAddress ?? null,
  });
}

