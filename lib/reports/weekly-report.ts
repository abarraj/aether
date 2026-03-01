import {
  subDays,
  formatISO,
  format,
  startOfWeek,
  endOfWeek,
  subWeeks,
} from 'date-fns';

import { createClient } from '@/lib/supabase/server';
import { claudeClient } from '@/lib/ai/claude';

type SnapshotRow = {
  date: string;
  period: string;
  metrics: {
    revenue?: number | null;
    laborCost?: number | null;
    utilization?: number | null;
  };
};

type GapRow = {
  dimension_field: string;
  dimension_value: string;
  gap_value: number;
  gap_pct: number | null;
  period_start: string;
};

type AlertRow = {
  type: string;
  severity: string;
  title: string;
  created_at: string;
};

type TargetRow = {
  dimension_value: string;
  target_pct: number;
  current_pct_change: number | null;
  status: string;
};

export type WeeklyReportData = {
  orgName: string;
  weekLabel: string;
  revenue: { current: number; previous: number; changePct: number | null };
  laborCost: { current: number; previous: number; changePct: number | null };
  utilization: { current: number | null; previous: number | null };
  topGaps: {
    entity: string;
    dimension: string;
    gap: number;
    pct: number | null;
  }[];
  alerts: { title: string; severity: string }[];
  targets: {
    entity: string;
    progress: number;
    targetPct: number;
    status: string;
  }[];
  aiSummary: string;
  dailySeries: { date: string; revenue: number }[];
  dashboardUrl: string;
};

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export async function generateWeeklyReport(
  orgId: string,
): Promise<WeeklyReportData | null> {
  const supabase = await createClient();

  const { data: org } = await supabase
    .from('organizations')
    .select('name, industry, currency')
    .eq('id', orgId)
    .maybeSingle();

  if (!org) return null;

  const now = new Date();
  const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
  const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

  const [thisWeekSnaps, lastWeekSnaps] = await Promise.all([
    supabase
      .from('kpi_snapshots')
      .select('date, period, metrics')
      .eq('org_id', orgId)
      .eq('period', 'daily')
      .gte('date', formatISO(lastWeekStart, { representation: 'date' }))
      .lte('date', formatISO(now, { representation: 'date' }))
      .order('date', { ascending: true })
      .returns<SnapshotRow[]>(),
    supabase
      .from('kpi_snapshots')
      .select('date, period, metrics')
      .eq('org_id', orgId)
      .eq('period', 'daily')
      .gte('date', formatISO(subDays(lastWeekStart, 7), { representation: 'date' }))
      .lt('date', formatISO(lastWeekStart, { representation: 'date' }))
      .order('date', { ascending: true })
      .returns<SnapshotRow[]>(),
  ]);

  const currentSnaps = (thisWeekSnaps.data ?? []).filter(
    (s) => s.date >= formatISO(lastWeekStart, { representation: 'date' }),
  );
  const previousSnaps = lastWeekSnaps.data ?? [];

  const sumMetric = (
    snaps: SnapshotRow[],
    key: 'revenue' | 'laborCost',
  ): number =>
    snaps.reduce((sum, s) => sum + (s.metrics[key] ?? 0), 0);

  const avgMetric = (snaps: SnapshotRow[]): number | null => {
    const vals = snaps
      .filter((s) => s.metrics.utilization != null)
      .map((s) => s.metrics.utilization!);
    return vals.length > 0
      ? vals.reduce((a, b) => a + b, 0) / vals.length
      : null;
  };

  const currentRevenue = sumMetric(currentSnaps, 'revenue');
  const previousRevenue = sumMetric(previousSnaps, 'revenue');
  const currentLabor = sumMetric(currentSnaps, 'laborCost');
  const previousLabor = sumMetric(previousSnaps, 'laborCost');

  const { data: gapRows } = await supabase
    .from('performance_gaps')
    .select('dimension_field, dimension_value, gap_value, gap_pct, period_start')
    .eq('org_id', orgId)
    .eq('period', 'weekly')
    .order('gap_value', { ascending: false })
    .limit(10)
    .returns<GapRow[]>();

  const topGaps = (gapRows ?? []).slice(0, 5).map((g) => ({
    entity: g.dimension_value,
    dimension: g.dimension_field,
    gap: Number(g.gap_value),
    pct: g.gap_pct != null ? Number(g.gap_pct) : null,
  }));

  const { data: alertRows } = await supabase
    .from('alerts')
    .select('type, severity, title, created_at')
    .eq('org_id', orgId)
    .gte('created_at', formatISO(lastWeekStart))
    .order('created_at', { ascending: false })
    .limit(5)
    .returns<AlertRow[]>();

  const { data: targetRows } = await supabase
    .from('action_targets')
    .select('dimension_value, target_pct, current_pct_change, status')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .limit(5)
    .returns<TargetRow[]>();

  const targets = (targetRows ?? []).map((t) => ({
    entity: t.dimension_value,
    progress: t.current_pct_change ?? 0,
    targetPct: t.target_pct,
    status: t.status,
  }));

  const dailySeries = currentSnaps.map((s) => ({
    date: s.date,
    revenue: s.metrics.revenue ?? 0,
  }));

  let aiSummary = '';
  try {
    const summaryData = {
      revenue: { current: currentRevenue, previous: previousRevenue },
      laborCost: { current: currentLabor, previous: previousLabor },
      topGaps: topGaps.slice(0, 3),
      alerts: (alertRows ?? []).length,
      targets,
    };

    const completion = await claudeClient.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 200,
      system:
        `You are the AI COO for ${org.name}. Write a 3-4 sentence executive summary for a weekly email report. ` +
        'Lead with the most important trend. Mention specific entity names and numbers. ' +
        'Be direct and actionable. Do not use bullet points or headers.',
      messages: [
        {
          role: 'user',
          content: `Weekly data: ${JSON.stringify(summaryData)}\n\nWrite the executive summary.`,
        },
      ],
    });

    aiSummary = completion.content
      .filter((p) => p.type === 'text')
      .map((p) => ('text' in p ? p.text : ''))
      .join('')
      .trim();
  } catch {
    aiSummary = `Revenue was ${formatMoney(currentRevenue)} this week.`;
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  return {
    orgName: org.name,
    weekLabel: `${format(lastWeekStart, 'MMM d')} – ${format(lastWeekEnd, 'MMM d, yyyy')}`,
    revenue: {
      current: currentRevenue,
      previous: previousRevenue,
      changePct: pctChange(currentRevenue, previousRevenue),
    },
    laborCost: {
      current: currentLabor,
      previous: previousLabor,
      changePct: pctChange(currentLabor, previousLabor),
    },
    utilization: {
      current: avgMetric(currentSnaps),
      previous: avgMetric(previousSnaps),
    },
    topGaps,
    alerts: (alertRows ?? []).map((a) => ({ title: a.title, severity: a.severity })),
    targets,
    aiSummary,
    dailySeries,
    dashboardUrl: `${baseUrl}/dashboard`,
  };
}

export function buildReportHtml(data: WeeklyReportData): string {
  const deltaColor = (pct: number | null) =>
    pct == null ? '#71717A' : pct >= 0 ? '#10b981' : '#ef4444';
  const deltaLabel = (pct: number | null) =>
    pct == null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
  const fm = (v: number) => formatMoney(v);

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#0A0A0A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:32px 24px;">

  <!-- Header -->
  <div style="text-align:center;padding-bottom:24px;border-bottom:1px solid #27272A;">
    <div style="display:inline-block;background:#10b981;border-radius:12px;width:40px;height:40px;line-height:40px;text-align:center;font-weight:bold;font-size:20px;color:white;">A</div>
    <h1 style="color:#e2e8f0;font-size:20px;margin:12px 0 4px;">Weekly Performance Report</h1>
    <div style="color:#71717A;font-size:13px;">${data.orgName} · ${data.weekLabel}</div>
  </div>

  <!-- AI Summary -->
  <div style="margin:24px 0;padding:20px;background:#0f1f18;border:1px solid #064e3b;border-radius:16px;">
    <div style="color:#10b981;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;">AI Executive Summary</div>
    <div style="color:#cbd5e1;font-size:14px;line-height:1.6;">${data.aiSummary}</div>
  </div>

  <!-- KPI Cards -->
  <div style="display:flex;gap:12px;margin:24px 0;">
    <div style="flex:1;background:#18181B;border:1px solid #27272A;border-radius:12px;padding:16px;">
      <div style="color:#71717A;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Revenue</div>
      <div style="color:white;font-size:22px;font-weight:bold;margin-top:4px;">${fm(data.revenue.current)}</div>
      <div style="color:${deltaColor(data.revenue.changePct)};font-size:12px;margin-top:4px;">${deltaLabel(data.revenue.changePct)} vs prev week</div>
    </div>
    <div style="flex:1;background:#18181B;border:1px solid #27272A;border-radius:12px;padding:16px;">
      <div style="color:#71717A;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Staff Costs</div>
      <div style="color:white;font-size:22px;font-weight:bold;margin-top:4px;">${fm(data.laborCost.current)}</div>
      <div style="color:${deltaColor(data.laborCost.changePct ? -data.laborCost.changePct : null)};font-size:12px;margin-top:4px;">${deltaLabel(data.laborCost.changePct)} vs prev week</div>
    </div>
  </div>

  <!-- Top Gaps -->
  ${data.topGaps.length > 0 ? `
  <div style="margin:24px 0;">
    <div style="color:#71717A;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;">Biggest Revenue Gaps</div>
    ${data.topGaps
      .slice(0, 3)
      .map(
        (g, i) => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;${i < 2 ? 'border-bottom:1px solid #1C1C1E;' : ''}">
      <div style="background:${g.pct && g.pct > 50 ? '#450a0a' : g.pct && g.pct > 30 ? '#451a03' : '#172554'};color:${g.pct && g.pct > 50 ? '#ef4444' : g.pct && g.pct > 30 ? '#f97316' : '#3b82f6'};border-radius:8px;width:28px;height:28px;line-height:28px;text-align:center;font-size:11px;font-weight:bold;">#${i + 1}</div>
      <div style="flex:1;">
        <div style="color:#e2e8f0;font-size:14px;">${g.entity}</div>
        <div style="color:#52525B;font-size:11px;">${g.dimension}</div>
      </div>
      <div style="color:#ef4444;font-size:14px;font-weight:600;">${fm(g.gap)}</div>
    </div>
    `,
      )
      .join('')}
  </div>
  ` : ''}

  <!-- Active Targets -->
  ${data.targets.length > 0 ? `
  <div style="margin:24px 0;">
    <div style="color:#71717A;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;">Target Progress</div>
    ${data.targets
      .map((t) => {
        const progressPct = Math.min(
          100,
          Math.max(0, (Math.abs(t.progress) / (t.targetPct || 50)) * 100),
        );
        return `
    <div style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span style="color:#e2e8f0;font-size:13px;">${t.entity}</span>
        <span style="color:#71717A;font-size:12px;">${Math.round(progressPct)}% of ${t.targetPct}% target</span>
      </div>
      <div style="background:#27272A;border-radius:4px;height:6px;">
        <div style="background:#10b981;border-radius:4px;height:6px;width:${progressPct}%;"></div>
      </div>
    </div>`;
      })
      .join('')}
  </div>
  ` : ''}

  <!-- Alerts -->
  ${data.alerts.length > 0 ? `
  <div style="margin:24px 0;">
    <div style="color:#71717A;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;">Alerts This Week</div>
    ${data.alerts
      .map(
        (a) => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 0;">
      <div style="width:8px;height:8px;border-radius:50%;background:${a.severity === 'critical' ? '#ef4444' : a.severity === 'warning' ? '#eab308' : '#3b82f6'};"></div>
      <div style="color:#cbd5e1;font-size:13px;">${a.title}</div>
    </div>
    `,
      )
      .join('')}
  </div>
  ` : ''}

  <!-- CTA -->
  <div style="text-align:center;margin:32px 0;">
    <a href="${data.dashboardUrl}" style="display:inline-block;background:#10b981;color:#0a0a0a;padding:14px 32px;border-radius:16px;font-size:14px;font-weight:600;text-decoration:none;">Open Your Dashboard</a>
  </div>

  <!-- Footer -->
  <div style="text-align:center;border-top:1px solid #27272A;padding-top:20px;margin-top:32px;">
    <div style="color:#3F3F46;font-size:11px;">Aether by 718 Solutions · Revenue Intelligence</div>
    <div style="color:#27272A;font-size:10px;margin-top:4px;">You can manage email preferences in Settings → Notifications</div>
  </div>

</div>
</body>
</html>`;
}
