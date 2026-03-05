// Target vs actual indicator for KPI cards on the dashboard.
// Shows a compact progress bar and label when a metric target exists.
'use client';

import { useEffect, useState } from 'react';
import { Target, CheckCircle2, AlertTriangle } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface MetricTarget {
  id: string;
  metric_key: string;
  target_value: number;
  comparator: string;
  period: string;
  label: string | null;
  current_value: number | null;
  current_met: boolean;
}

interface TargetIndicatorProps {
  orgId: string | null;
  metricKey: string;
  currentValue: number;
  period: string;
  formatValue?: (v: number) => string;
}

export function TargetIndicator({
  orgId,
  metricKey,
  currentValue,
  period,
  formatValue = (v) => v.toLocaleString(),
}: TargetIndicatorProps) {
  const [target, setTarget] = useState<MetricTarget | null>(null);

  useEffect(() => {
    if (!orgId) return;
    const supabase = createClient();

    supabase
      .from('targets')
      .select('id, metric_key, target_value, comparator, period, label, current_value, current_met')
      .eq('org_id', orgId)
      .eq('metric_key', metricKey)
      .eq('period', period)
      .eq('status', 'active')
      .limit(1)
      .returns<MetricTarget[]>()
      .then(({ data }) => {
        setTarget(data?.[0] ?? null);
      });
  }, [orgId, metricKey, period]);

  if (!target) return null;

  const comparatorSymbol =
    target.comparator === 'gte' ? '>=' : target.comparator === 'lte' ? '<=' : '=';

  // Determine if target is met based on current actual value
  const isMet =
    target.comparator === 'gte'
      ? currentValue >= target.target_value
      : target.comparator === 'lte'
        ? currentValue <= target.target_value
        : currentValue === target.target_value;

  // Progress towards target (clamped 0-100)
  const progress =
    target.target_value > 0
      ? Math.min(100, Math.max(0, (currentValue / target.target_value) * 100))
      : 0;

  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {isMet ? (
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
          ) : (
            <AlertTriangle className="h-3 w-3 text-amber-400" />
          )}
          <span className="text-[10px] text-slate-500">
            Target: {comparatorSymbol} {formatValue(target.target_value)}
          </span>
        </div>
        <span
          className={cn(
            'text-[10px] font-medium',
            isMet ? 'text-emerald-400' : 'text-amber-400',
          )}
        >
          {isMet ? 'Met' : `${progress.toFixed(0)}%`}
        </span>
      </div>
      <div className="h-1 rounded-full bg-zinc-800/50">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            isMet ? 'bg-emerald-500' : progress > 80 ? 'bg-amber-500' : 'bg-rose-500',
          )}
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>
    </div>
  );
}
