// Rule-based recommendations engine that generates alerts using Claude.

import { subDays, formatISO } from 'date-fns';

import { createClient as createServerClient } from '@/lib/supabase/server';
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

export type RecommendationAlert = {
  org_id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  data: Record<string, unknown>;
  is_read: boolean;
  is_dismissed: boolean;
};

function formatCurrency(value: number): string {
  const rounded = Math.round(value);
  return `$${rounded.toLocaleString('en-US')}`;
}

export async function generateRecommendations(orgId: string): Promise<RecommendationAlert[]> {
  const supabase = await createServerClient();

  const end = new Date();
  const start = subDays(end, 14);

  const { data: snapshots } = await supabase
    .from('kpi_snapshots')
    .select('date, period, metrics')
    .eq('org_id', orgId)
    .eq('period', 'daily')
    .gte('date', formatISO(start, { representation: 'date' }))
    .lte('date', formatISO(end, { representation: 'date' }))
    .order('date', { ascending: true })
    .returns<SnapshotRow[]>();

  if (!snapshots || snapshots.length < 3) {
    return [];
  }

  const alerts: RecommendationAlert[] = [];

  // Rule 1: Revenue dropping 3+ consecutive days.
  for (let index = snapshots.length - 3; index >= 0; index -= 1) {
    const a = snapshots[index];
    const b = snapshots[index + 1];
    const c = snapshots[index + 2];
    const ra = a.metrics.revenue ?? 0;
    const rb = b.metrics.revenue ?? 0;
    const rc = c.metrics.revenue ?? 0;

    if (ra > 0 && rb > 0 && rc > 0 && ra > rb && rb > rc) {
      const trend = [
        `${a.date}: ${formatCurrency(ra)}`,
        `${b.date}: ${formatCurrency(rb)}`,
        `${c.date}: ${formatCurrency(rc)}`,
      ].join('\n');

      const completion = await claudeClient.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 256,
        system:
          'You are an AI COO. Given a short revenue trend, write a concise recommendation ' +
          'for how the operator should respond. Be specific about numbers and actions. ' +
          'Return 2-3 sentences.',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Revenue has declined for 3 consecutive days:\n${trend}\n\nWhat is your recommendation?`,
              },
            ],
          },
        ],
      });

      const description = completion.content
        .filter((part) => part.type === 'text')
        .map((part) => ('text' in part ? part.text : ''))
        .join('\n')
        .trim();

      alerts.push({
        org_id: orgId,
        type: 'revenue_trend',
        severity: 'warning',
        title: 'Revenue is falling across the last 3 days',
        description,
        data: {
          rule: 'revenue_drop_3_days',
          points: [
            { date: a.date, revenue: ra },
            { date: b.date, revenue: rb },
            { date: c.date, revenue: rc },
          ],
        },
        is_read: false,
        is_dismissed: false,
      });

      break;
    }
  }

  // Rule 2: Labor cost > 35% of revenue (on average in the last 7 days).
  const recent = snapshots.slice(-7);
  let laborCostTotal = 0;
  let revenueTotal = 0;

  for (const snapshot of recent) {
    laborCostTotal += snapshot.metrics.laborCost ?? 0;
    revenueTotal += snapshot.metrics.revenue ?? 0;
  }

  if (revenueTotal > 0) {
    const ratio = laborCostTotal / revenueTotal;
    if (ratio > 0.35) {
      const completion = await claudeClient.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 256,
        system:
          'You are an AI COO. Given labor and revenue numbers, ' +
          'suggest concrete actions to optimize labor cost while protecting service quality. ' +
          'Be specific about percentages and operational levers.',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  `In the last 7 days, total revenue was ${formatCurrency(
                    revenueTotal,
                  )} and total labor cost was ${formatCurrency(
                    laborCostTotal,
                  )}, so labor cost is ${(ratio * 100).toFixed(
                    1,
                  )}% of revenue.\n\nWhat specific optimizations should we consider?`,
              },
            ],
          },
        ],
      });

      const description = completion.content
        .filter((part) => part.type === 'text')
        .map((part) => ('text' in part ? part.text : ''))
        .join('\n')
        .trim();

      alerts.push({
        org_id: orgId,
        type: 'labor_optimization',
        severity: 'info',
        title: 'Labor cost is high relative to revenue',
        description,
        data: {
          rule: 'labor_cost_ratio',
          revenueTotal,
          laborCostTotal,
          ratio,
        },
        is_read: false,
        is_dismissed: false,
      });
    }
  }

  // Rules 3 & 4: Utilization <60% (underutilized) or >95% (capacity constrained).
  const lowUtilDays = snapshots.filter(
    (snapshot) =>
      snapshot.metrics.utilization != null && snapshot.metrics.utilization < 60,
  );
  const highUtilDays = snapshots.filter(
    (snapshot) =>
      snapshot.metrics.utilization != null && snapshot.metrics.utilization > 95,
  );

  if (lowUtilDays.length > 0) {
    const summary = lowUtilDays
      .slice(-5)
      .map(
        (snapshot) =>
          `${snapshot.date}: ${snapshot.metrics.utilization?.toFixed(1) ?? 0}%`,
      )
      .join('\n');

    const completion = await claudeClient.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 256,
      system:
        'You are an AI COO. Suggest schedule and pricing optimizations for underutilized days. ' +
        'Be specific about which days to consolidate, where to add offers, and what impact to expect.',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `These days have low utilization (<60%):\n${summary}\n\nWhat concrete actions should we take?`,
            },
          ],
        },
      ],
    });

    const description = completion.content
      .filter((part) => part.type === 'text')
      .map((part) => ('text' in part ? part.text : ''))
      .join('\n')
      .trim();

    alerts.push({
      org_id: orgId,
      type: 'schedule_optimization',
      severity: 'info',
      title: 'Underutilized days present schedule optimization opportunities',
      description,
      data: {
        rule: 'low_util_days',
        days: lowUtilDays.map((snapshot) => ({
          date: snapshot.date,
          utilization: snapshot.metrics.utilization,
        })),
      },
      is_read: false,
      is_dismissed: false,
    });
  }

  if (highUtilDays.length > 0) {
    const summary = highUtilDays
      .slice(-5)
      .map(
        (snapshot) =>
          `${snapshot.date}: ${snapshot.metrics.utilization?.toFixed(1) ?? 0}%`,
      )
      .join('\n');

    const completion = await claudeClient.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 256,
      system:
        'You are an AI COO. High utilization indicates constrained capacity. ' +
        'Recommend specific expansion or pricing moves to capture upside without breaking the operation.',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `These days have very high utilization (>95%):\n${summary}\n\nWhat expansion or pricing moves should we consider?`,
            },
          ],
        },
      ],
    });

    const description = completion.content
      .filter((part) => part.type === 'text')
      .map((part) => ('text' in part ? part.text : ''))
      .join('\n')
      .trim();

    alerts.push({
      org_id: orgId,
      type: 'expansion_opportunity',
      severity: 'info',
      title: 'Demand is consistently above capacity on some days',
      description,
      data: {
        rule: 'high_util_days',
        days: highUtilDays.map((snapshot) => ({
          date: snapshot.date,
          utilization: snapshot.metrics.utilization,
        })),
      },
      is_read: false,
      is_dismissed: false,
    });
  }

  return alerts;
}

