import { NextResponse } from 'next/server';

import { getOrgContext } from '@/lib/auth/org-context';

type AuditRow = {
  action: string;
  description: string | null;
  target_type: string | null;
  created_at: string;
  actor_email: string | null;
};

type AlertRow = {
  type: string;
  title: string;
  severity: string;
  created_at: string;
};

type TargetRow = {
  dimension_value: string;
  status: string;
  title: string | null;
  created_at: string;
  completed_at: string | null;
};

export async function GET() {
  try {
    const ctx = await getOrgContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [auditsRes, alertsRes, targetsRes] = await Promise.all([
      ctx.supabase
        .from('audit_log')
        .select('action, description, target_type, created_at, actor_email')
        .eq('org_id', ctx.orgId)
        .order('created_at', { ascending: false })
        .limit(10)
        .returns<AuditRow[]>(),
      ctx.supabase
        .from('alerts')
        .select('type, title, severity, created_at')
        .eq('org_id', ctx.orgId)
        .order('created_at', { ascending: false })
        .limit(10)
        .returns<AlertRow[]>(),
      ctx.supabase
        .from('action_targets')
        .select('dimension_value, status, title, created_at, completed_at')
        .eq('org_id', ctx.orgId)
        .order('created_at', { ascending: false })
        .limit(10)
        .returns<TargetRow[]>(),
    ]);

    type FeedItem = {
      type: 'audit' | 'alert' | 'target';
      title: string;
      subtitle: string | null;
      severity: string | null;
      timestamp: string;
    };

    const items: FeedItem[] = [];

    for (const a of auditsRes.data ?? []) {
      items.push({
        type: 'audit',
        title: a.description ?? a.action,
        subtitle: a.actor_email ?? null,
        severity: null,
        timestamp: a.created_at,
      });
    }

    for (const a of alertsRes.data ?? []) {
      items.push({
        type: 'alert',
        title: a.title,
        subtitle: a.type,
        severity: a.severity,
        timestamp: a.created_at,
      });
    }

    for (const t of targetsRes.data ?? []) {
      items.push({
        type: 'target',
        title:
          t.status === 'completed'
            ? `Target completed: ${t.dimension_value}`
            : `Target set: ${t.title ?? t.dimension_value}`,
        subtitle: t.status,
        severity: t.status === 'completed' ? 'success' : null,
        timestamp: t.completed_at ?? t.created_at,
      });
    }

    // Sort by timestamp descending
    items.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return NextResponse.json({ items: items.slice(0, 20) });
  } catch (err) {
    console.error('Activity feed error:', err);
    return NextResponse.json({ items: [] });
  }
}
