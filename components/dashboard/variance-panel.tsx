// Variance, correlation, and opportunity signals panel.
// Shows computed statistical metrics and deterministic opportunity detection.
'use client';

import { useEffect, useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, Activity, Lightbulb, BarChart3 } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface VarianceRow {
  metric_key: string;
  period_start: string;
  value: number | null;
}

interface VariancePanelProps {
  orgId: string | null;
  period: 'weekly' | 'monthly';
  revenue: number;
  laborCost: number;
  utilization: number;
  attendance: number;
}

interface OpportunitySignal {
  type: 'capacity' | 'cost' | 'revenue' | 'attendance';
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
}

function CorrelationBadge({ label, value }: { label: string; value: number }) {
  const strength =
    Math.abs(value) >= 0.7
      ? 'strong'
      : Math.abs(value) >= 0.4
        ? 'moderate'
        : 'weak';

  const color =
    strength === 'strong'
      ? value > 0
        ? 'text-emerald-400 bg-emerald-500/10'
        : 'text-rose-400 bg-rose-500/10'
      : strength === 'moderate'
        ? 'text-amber-400 bg-amber-500/10'
        : 'text-slate-500 bg-zinc-800/50';

  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-800/40 bg-zinc-900/50 px-3 py-2">
      <span className="text-[11px] text-slate-400">{label}</span>
      <div className="flex items-center gap-2">
        <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-medium', color)}>
          r = {value.toFixed(2)}
        </span>
        <span className="text-[10px] text-slate-600">{strength}</span>
      </div>
    </div>
  );
}

function VarianceBadge({ label, cv }: { label: string; cv: number }) {
  const level =
    cv > 0.5 ? 'high' : cv > 0.25 ? 'moderate' : 'low';

  const color =
    level === 'high'
      ? 'text-rose-400 bg-rose-500/10'
      : level === 'moderate'
        ? 'text-amber-400 bg-amber-500/10'
        : 'text-emerald-400 bg-emerald-500/10';

  const Icon = level === 'low' ? TrendingUp : level === 'moderate' ? Activity : TrendingDown;

  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-800/40 bg-zinc-900/50 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <Icon className={cn('h-3.5 w-3.5', level === 'low' ? 'text-emerald-400' : level === 'moderate' ? 'text-amber-400' : 'text-rose-400')} />
        <span className="text-[11px] text-slate-400">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-medium', color)}>
          CV = {(cv * 100).toFixed(1)}%
        </span>
        <span className="text-[10px] text-slate-600">{level} volatility</span>
      </div>
    </div>
  );
}

export function VariancePanel({
  orgId,
  period,
  revenue,
  laborCost,
  utilization,
  attendance,
}: VariancePanelProps) {
  const [data, setData] = useState<VarianceRow[]>([]);

  useEffect(() => {
    if (!orgId) return;

    const supabase = createClient();

    const derivedKeys = [
      'revenue_variance',
      'labor_cost_variance',
      'corr_revenue_labor',
      'corr_revenue_attendance',
      'revenue_forecast',
      'staff_cost_ratio',
    ];

    supabase
      .from('metric_snapshots')
      .select('metric_key, period_start, value')
      .eq('org_id', orgId)
      .eq('period', period)
      .in('metric_key', derivedKeys)
      .eq('dimensions', '{}')
      .order('period_start', { ascending: false })
      .limit(50)
      .returns<VarianceRow[]>()
      .then(({ data: rows }) => {
        setData(rows ?? []);
      });
  }, [orgId, period]);

  // Get latest values for each derived metric
  const latest = useMemo(() => {
    const map: Record<string, number | null> = {};
    for (const row of data) {
      if (!(row.metric_key in map)) {
        map[row.metric_key] = row.value;
      }
    }
    return map;
  }, [data]);

  // Deterministic opportunity detection
  const opportunities = useMemo<OpportunitySignal[]>(() => {
    const signals: OpportunitySignal[] = [];
    const revenueCV = latest['revenue_variance'];
    const staffRatio = latest['staff_cost_ratio'];
    const corrRevLabor = latest['corr_revenue_labor'];

    // Underutilized capacity + volatile revenue
    if (utilization > 0 && utilization < 60 && revenueCV != null && revenueCV > 0.3) {
      signals.push({
        type: 'capacity',
        severity: 'high',
        title: 'Underutilized capacity with volatile revenue',
        description:
          `Capacity at ${utilization.toFixed(0)}% with ${(revenueCV * 100).toFixed(0)}% revenue volatility. ` +
          'Consider schedule optimization or targeted promotions to fill low-demand periods.',
      });
    }

    // Rising cost ratio with low attendance
    if (staffRatio != null && staffRatio > 35 && attendance > 0 && utilization < 50) {
      signals.push({
        type: 'cost',
        severity: 'high',
        title: 'High staff cost ratio with low capacity',
        description:
          `Staff costs at ${staffRatio.toFixed(0)}% of revenue with ${utilization.toFixed(0)}% capacity. ` +
          'Consider right-sizing staffing levels or shifting to variable compensation.',
      });
    }

    // Low revenue-labor correlation (fixed costs regardless of revenue)
    if (corrRevLabor != null && corrRevLabor < 0.3 && laborCost > 0) {
      signals.push({
        type: 'cost',
        severity: 'medium',
        title: 'Staff costs do not scale with revenue',
        description:
          `Revenue-labor correlation is ${corrRevLabor.toFixed(2)} (weak). ` +
          'Staff costs remain fixed regardless of revenue swings. Consider variable-pay or commission structures.',
      });
    }

    // Low utilization as standalone signal
    if (utilization > 0 && utilization < 40 && signals.every((s) => s.type !== 'capacity')) {
      signals.push({
        type: 'capacity',
        severity: 'medium',
        title: 'Significant unused capacity',
        description:
          `Operating at ${utilization.toFixed(0)}% capacity. ` +
          'Substantial room for growth without adding fixed costs.',
      });
    }

    // Stable revenue (low variance) — positive signal
    if (revenueCV != null && revenueCV < 0.15 && revenue > 0) {
      signals.push({
        type: 'revenue',
        severity: 'low',
        title: 'Stable revenue pattern',
        description:
          `Revenue coefficient of variation is ${(revenueCV * 100).toFixed(1)}% (low). ` +
          'Consistent revenue stream indicates predictable operations.',
      });
    }

    return signals;
  }, [latest, utilization, attendance, laborCost, revenue]);

  const revenueCV = latest['revenue_variance'];
  const laborCV = latest['labor_cost_variance'];
  const corrRevLabor = latest['corr_revenue_labor'];
  const corrRevAttendance = latest['corr_revenue_attendance'];

  const hasVariance = revenueCV != null || laborCV != null;
  const hasCorrelation = corrRevLabor != null || corrRevAttendance != null;
  const hasOpportunities = opportunities.length > 0;

  if (!hasVariance && !hasCorrelation && !hasOpportunities) return null;

  return (
    <div className="rounded-2xl border border-zinc-800/60 bg-zinc-950/80 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-slate-500" />
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
          Statistical Analysis
        </span>
        <span className="text-[10px] text-slate-600">
          {period === 'weekly' ? 'Weekly' : 'Monthly'}
        </span>
      </div>

      {/* Variance indicators */}
      {hasVariance && (
        <div className="space-y-2">
          <div className="text-[11px] font-medium text-slate-500">Volatility</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {revenueCV != null && (
              <VarianceBadge label="Revenue" cv={revenueCV} />
            )}
            {laborCV != null && (
              <VarianceBadge label="Staff Costs" cv={laborCV} />
            )}
          </div>
        </div>
      )}

      {/* Correlation indicators */}
      {hasCorrelation && (
        <div className="space-y-2">
          <div className="text-[11px] font-medium text-slate-500">Correlations</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {corrRevLabor != null && (
              <CorrelationBadge label="Revenue / Staff Costs" value={corrRevLabor} />
            )}
            {corrRevAttendance != null && (
              <CorrelationBadge label="Revenue / Attendance" value={corrRevAttendance} />
            )}
          </div>
        </div>
      )}

      {/* Opportunity signals */}
      {hasOpportunities && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
            <Lightbulb className="h-3 w-3" />
            Opportunities
          </div>
          <div className="space-y-2">
            {opportunities.map((opp, i) => (
              <div
                key={i}
                className={cn(
                  'rounded-lg border px-3 py-2.5',
                  opp.severity === 'high'
                    ? 'border-rose-500/20 bg-rose-500/5'
                    : opp.severity === 'medium'
                      ? 'border-amber-500/20 bg-amber-500/5'
                      : 'border-emerald-500/20 bg-emerald-500/5',
                )}
              >
                <div
                  className={cn(
                    'text-[11px] font-medium',
                    opp.severity === 'high'
                      ? 'text-rose-400'
                      : opp.severity === 'medium'
                        ? 'text-amber-400'
                        : 'text-emerald-400',
                  )}
                >
                  {opp.title}
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                  {opp.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
