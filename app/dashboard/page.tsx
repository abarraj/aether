'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Sparkles, Info, ChevronRight, Target, Zap } from 'lucide-react';
import { format, subDays } from 'date-fns';

import { useUser } from '@/hooks/use-user';
import { useOrg } from '@/hooks/use-org';
import { useKpis } from '@/hooks/use-kpis';
import { useBenchmarks } from '@/hooks/use-benchmarks';
import { useRealtimeTable } from '@/hooks/use-realtime';
import { toast } from 'sonner';
import { AnimatedNumber } from '@/components/shared/animated-number';
import { FirstRunBanner } from '@/components/shared/first-run-banner';
import type { DateRange, Period } from '@/lib/data/aggregator';
import { cn } from '@/lib/utils';

type RangePreset = '7d' | '30d' | '90d';

type ActionTarget = {
  id: string;
  dimension_field: string;
  dimension_value: string;
  target_pct: number;
  baseline_gap: number;
  current_gap: number | null;
  current_pct_change: number | null;
  status: string;
  deadline: string | null;
  title: string | null;
  created_at: string;
};

function RichSpotlight({
  text,
  onNavigate,
}: {
  text: string;
  onNavigate: (path: string) => void;
}) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return (
    <p className="text-sm leading-relaxed text-slate-300">
      {parts.map((part, i) => {
        const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
          const [, label, path] = linkMatch;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onNavigate(path)}
              className="mx-0.5 inline-flex items-center gap-0.5 text-emerald-400 underline underline-offset-2 transition-colors hover:text-emerald-300"
            >
              {label}
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

function getInitialRange(): { period: Period; preset: RangePreset; range: DateRange } {
  const end = new Date();
  const start = subDays(end, 6);
  return {
    period: 'daily',
    preset: '7d',
    range: {
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
    },
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const { profile } = useUser();
  const { org, activeOrgIds } = useOrg();

  const initial = useMemo(getInitialRange, []);
  const [period, setPeriod] = useState<Period>(initial.period);
  const [preset, setPreset] = useState<RangePreset>(initial.preset);
  const [range, setRange] = useState<DateRange>(initial.range);
  const [refreshKey, setRefreshKey] = useState(0);
  const [leakage, setLeakage] = useState<{
    weekStart: string;
    totalLeakage: number;
    topLeakage: { dimension_value: string; gap_value: number; gap_pct?: number | null }[];
  } | null>(null);
  const [hasUploads, setHasUploads] = useState<boolean | null>(null);
  const [targets, setTargets] = useState<ActionTarget[]>([]);
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const [spotlightLoading, setSpotlightLoading] = useState(true);
  const [topLeakers, setTopLeakers] = useState<
    { value: string; gap: number; pct: number | null }[]
  >([]);

  const effectiveOrgIds =
    activeOrgIds.length > 0 ? activeOrgIds : org ? [org.id] : [];
  const { kpis, isLoading } = useKpis(period, range, refreshKey, effectiveOrgIds);
  const { benchmark } = useBenchmarks(org?.industry ?? null);

  const greetingName =
    profile?.full_name?.split(' ')[0] ??
    org?.name?.split(' ')[0] ??
    'there';

  const hour = new Date().getHours();
  const greeting =
    hour >= 5 && hour < 12
      ? 'Good morning'
      : hour >= 12 && hour < 17
        ? 'Good afternoon'
        : hour >= 17 && hour < 21
          ? 'Good evening'
          : 'Working late';
  const greetingSuffix = hour >= 21 || hour < 5 ? '?' : ',';

  const handlePresetChange = useCallback((nextPreset: RangePreset) => {
    const end = new Date();
    let days = 7;
    if (nextPreset === '30d') days = 30;
    if (nextPreset === '90d') days = 90;
    const start = subDays(end, days - 1);

    setPreset(nextPreset);
    setPeriod('daily');
    setRange({
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
    });
  }, []);

  const hasSeries = (kpis?.series?.length ?? 0) > 0;
  const isActuallyEmpty = !isLoading && !hasSeries && hasUploads === false;

  // Auto-widen time range if current range has no data
  useEffect(() => {
    if (isLoading || !hasUploads) return;
    if (!hasSeries && preset === '7d') {
      handlePresetChange('30d');
    } else if (!hasSeries && preset === '30d') {
      handlePresetChange('90d');
    }
  }, [isLoading, hasSeries, hasUploads, preset, handlePresetChange]);

  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleKpiRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }
    refreshTimeoutRef.current = setTimeout(() => {
      setRefreshKey((previous) => previous + 1);
    }, 2000);
  }, []);

  useRealtimeTable(
    'kpi_snapshots',
    org ? { column: 'org_id', value: org.id } : undefined,
    (payload) => {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        scheduleKpiRefresh();
      }
    },
  );

  useRealtimeTable(
    'uploads',
    org ? { column: 'org_id', value: org.id } : undefined,
    (payload) => {
      if (
        (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') &&
        (payload.new as { status?: string } | null)?.status === 'ready'
      ) {
        toast.success('New data processed — dashboard updated');
      }
    },
  );

  useEffect(() => {
    if (!org) {
      setLeakage(null);
      return;
    }
    fetch('/api/metrics/gaps/weekly')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.weekStart === 'string') {
          setLeakage({
            weekStart: data.weekStart,
            totalLeakage: Number(data.totalLeakage ?? 0) || 0,
            topLeakage: Array.isArray(data.topLeakage)
              ? data.topLeakage.slice(0, 5).map(
                  (r: {
                    dimension_value?: string;
                    gap_value?: number;
                    gap_pct?: number | null;
                  }) => ({
                    dimension_value: String(r.dimension_value ?? ''),
                    gap_value: Number(r.gap_value ?? 0),
                    gap_pct: r.gap_pct != null ? Number(r.gap_pct) : null,
                  }),
                )
              : [],
          });
        } else {
          setLeakage(null);
        }
      })
      .catch(() => setLeakage(null));
  }, [org?.id]);

  // AI Spotlight
  useEffect(() => {
    if (!org) return;
    setSpotlightLoading(true);
    fetch('/api/ai/spotlight')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSpotlight(data?.text ?? null))
      .catch(() => setSpotlight(null))
      .finally(() => setSpotlightLoading(false));
  }, [org?.id]);

  // Active targets
  useEffect(() => {
    if (!org) return;
    fetch('/api/targets')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { targets?: ActionTarget[] } | null) => {
        if (data?.targets) {
          setTargets(data.targets.filter((t) => t.status === 'active'));
        }
      })
      .catch(() => {});
  }, [org?.id]);

  // Top leakers (from existing leakage data)
  useEffect(() => {
    if (leakage?.topLeakage && leakage.topLeakage.length > 0) {
      setTopLeakers(
        leakage.topLeakage.map(
          (r: {
            dimension_value: string;
            gap_value: number;
            gap_pct?: number | null;
          }) => ({
            value: r.dimension_value,
            gap: Number(r.gap_value),
            pct: r.gap_pct != null ? Number(r.gap_pct) : null,
          }),
        ),
      );
    } else {
      setTopLeakers([]);
    }
  }, [leakage]);

  useEffect(() => {
    if (!org) return;
    const checkUploads = async () => {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { count } = await supabase
        .from('uploads')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org.id)
        .eq('status', 'ready');
      setHasUploads((count ?? 0) > 0);
    };
    checkUploads();
  }, [org]);

  const formatCurrency = (value: number): string =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: org?.currency ?? 'USD',
      maximumFractionDigits: 0,
    }).format(value);

  const periodLabel =
    preset === '7d' ? 'last week' : preset === '30d' ? 'last month' : 'last quarter';

  const chartData =
    kpis?.series.map((point) => ({
      dateLabel: format(new Date(point.date), 'MMM d'),
      revenue: point.revenue ?? 0,
      labor: point.laborCost ?? 0,
    })) ?? [];

  const insight = useMemo(() => {
    if (!kpis) return null;
    const staffPct =
      kpis.revenue > 0
        ? ((kpis.laborCost / kpis.revenue) * 100).toFixed(0)
        : null;
    const revChange = kpis.changes.revenuePct;

    if (revChange != null && revChange > 5) {
      return `Revenue is up ${revChange.toFixed(0)}% — strong trajectory.`;
    }
    if (revChange != null && revChange < -5) {
      return `Revenue dropped ${Math.abs(revChange).toFixed(0)}% — worth investigating.`;
    }
    if (staffPct && Number(staffPct) > 35) {
      return `Staff costs at ${staffPct}% of revenue — above typical range.`;
    }
    if (kpis.utilization > 0 && kpis.utilization < 40) {
      return `Capacity at ${kpis.utilization.toFixed(0)}% — significant room to grow.`;
    }
    return `Tracking ${kpis.series.length} days of operational data.`;
  }, [kpis]);

  const targetCount = targets.length;
  const insightParts: string[] = [];
  if (insight) insightParts.push(insight);
  if (targetCount > 0)
    insightParts.push(
      `${targetCount} active target${targetCount > 1 ? 's' : ''}.`,
    );
  const fullInsight = insightParts.join(' ');

  const laborChange = kpis?.changes.laborCostPct ?? null;
  const capacityChange = kpis?.changes.utilizationPct ?? null;

  const renderKpiChange = (
    change: number | null,
    isPositiveGood: boolean,
  ): React.ReactNode => {
    if (change == null) return null;
    const positive = change >= 0;
    const className = isPositiveGood
      ? positive
        ? 'text-emerald-400'
        : 'text-rose-400'
      : positive
        ? 'text-rose-400'
        : 'text-emerald-400';
    return (
      <span className={cn('text-[11px] font-semibold', className)}>
        {positive ? '+' : ''}
        {change.toFixed(1)}%
      </span>
    );
  };

  return (
    <div className="relative space-y-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-emerald-500/[0.02] to-transparent" />

      {/* Row 1: Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between relative">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            {greeting}
            {greetingSuffix} {greetingName}
          </h1>
          {fullInsight && (
            <p className="mt-1.5 text-sm text-slate-500">{fullInsight}</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-2xl border border-zinc-800 bg-zinc-950/80 p-1 text-xs text-slate-300">
            {(['7d', '30d', '90d'] as RangePreset[]).map((option) => {
              const isDisabled =
                !hasSeries &&
                ((preset === '30d' && option === '7d') ||
                  (preset === '90d' && (option === '7d' || option === '30d')));
              return (
                <button
                  key={option}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handlePresetChange(option)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                    preset === option
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : isDisabled
                        ? 'cursor-not-allowed text-slate-700'
                        : 'text-slate-500 hover:text-slate-300',
                  )}
                >
                  {option === '7d' && 'This week'}
                  {option === '30d' && 'This month'}
                  {option === '90d' && 'This quarter'}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="rounded-2xl border border-zinc-800 bg-zinc-950/80 px-4 py-1.5 text-xs text-slate-200 hover:bg-zinc-900 transition-all"
            onClick={() => {
              if (!kpis) return;
              const rows = kpis.series.map((row) => ({
                date: row.date,
                revenue: row.revenue ?? '',
                laborCost: row.laborCost ?? '',
                utilization: row.utilization ?? '',
              }));

              const header = 'date,revenue,laborCost,utilization';
              const csvLines = [
                header,
                ...rows.map(
                  (row) =>
                    `${row.date},${row.revenue},${row.laborCost},${row.utilization}`,
                ),
              ];
              const blob = new Blob([csvLines.join('\n')], {
                type: 'text/csv;charset=utf-8;',
              });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = 'aether-kpis.csv';
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export
          </button>
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && !kpis ? (
        <div className="space-y-4 animate-pulse">
          <div className="h-36 rounded-2xl border border-zinc-800/60 bg-zinc-950/80 p-6" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="h-28 rounded-2xl border border-zinc-800/60 bg-zinc-950/80 p-5" />
            <div className="h-28 rounded-2xl border border-zinc-800/60 bg-zinc-950/80 p-5" />
            <div className="h-28 rounded-2xl border border-zinc-800/60 bg-zinc-950/80 p-5" />
          </div>
          <div className="h-80 rounded-2xl border border-zinc-800/60 bg-zinc-950/80 p-6" />
        </div>
      ) : isActuallyEmpty ? (
        <motion.div
          className="mt-6 flex justify-center"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex max-w-md flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950 px-10 py-12 text-center shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10">
              <Sparkles className="h-6 w-6 text-emerald-400" />
            </div>
            <h2 className="text-lg font-semibold tracking-tight">
              Let&apos;s get your numbers in here
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Connect a spreadsheet or paste a Google Sheets link, and Aether will start tracking
              your revenue, costs, and performance automatically.
            </p>
            <button
              type="button"
              className="mt-6 rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-medium text-slate-950 hover:bg-emerald-600 transition shadow-[0_0_30px_rgba(16,185,129,0.08)]"
              onClick={() => {
                window.location.href = '/dashboard/data';
              }}
            >
              Connect Your Data
            </button>
            <p className="mt-3 text-xs text-slate-500">Takes about 2 minutes</p>
          </div>
        </motion.div>
      ) : (
        <>
          {hasSeries && <FirstRunBanner />}

          {/* Leakage + Targets Row */}
          {!isActuallyEmpty && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.5,
                delay: 0.2,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="grid grid-cols-1 gap-4 lg:grid-cols-2"
            >
              {/* Leakage with mini bars */}
              <div
                className="cursor-pointer rounded-2xl border border-zinc-800/60 bg-zinc-950/80 p-5 transition-all hover:border-rose-500/20 group"
                onClick={() => router.push('/dashboard/performance')}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    Revenue Leakage
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-600 transition-colors group-hover:text-rose-400" />
                </div>
                <div className="mt-2 text-2xl font-bold tracking-tighter text-rose-400">
                  {leakage && leakage.totalLeakage > 0 ? (
                    <AnimatedNumber
                      value={leakage.totalLeakage}
                      options={{
                        style: 'currency',
                        currency: org?.currency ?? 'USD',
                        maximumFractionDigits: 0,
                      }}
                    />
                  ) : (
                    '—'
                  )}
                </div>
                {topLeakers.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {topLeakers.slice(0, 5).map((leaker) => {
                      const maxGap = topLeakers[0]?.gap ?? 1;
                      const widthPct = Math.max(
                        8,
                        (leaker.gap / maxGap) * 100,
                      );
                      return (
                        <div
                          key={leaker.value}
                          className="flex items-center gap-3"
                        >
                          <span className="w-28 flex-shrink-0 truncate text-[11px] text-slate-400">
                            {leaker.value}
                          </span>
                          <div className="h-2 flex-1 rounded-full bg-zinc-800/50">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${widthPct}%`,
                                backgroundColor:
                                  leaker.pct != null && leaker.pct > 50
                                    ? '#ef4444'
                                    : leaker.pct != null && leaker.pct > 30
                                      ? '#f97316'
                                      : '#eab308',
                              }}
                            />
                          </div>
                          <span className="w-16 flex-shrink-0 text-right text-[11px] text-slate-500">
                            {formatCurrency(leaker.gap)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Active Targets */}
              <div className="rounded-2xl border border-zinc-800/60 bg-zinc-950/80 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    Active Targets
                  </span>
                  <span className="text-[11px] text-slate-600">
                    {targets.length} active
                  </span>
                </div>
                {targets.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {targets.slice(0, 4).map((target) => {
                      const progress =
                        target.baseline_gap > 0 &&
                        target.current_pct_change != null
                          ? Math.min(
                              100,
                              Math.max(
                                0,
                                (Math.abs(target.current_pct_change) /
                                  (target.target_pct || 50)) *
                                  100,
                              ),
                            )
                          : 0;
                      return (
                        <button
                          key={target.id}
                          type="button"
                          onClick={() =>
                            router.push(
                              `/dashboard/performance?entity=${encodeURIComponent(target.dimension_value)}`,
                            )
                          }
                          className="group w-full text-left"
                        >
                          <div className="mb-1 flex items-center justify-between">
                            <span className="truncate text-sm text-slate-200 transition-colors group-hover:text-emerald-400">
                              {target.dimension_value}
                            </span>
                            <span className="ml-2 flex-shrink-0 text-[11px] text-slate-500">
                              {Math.round(progress)}%
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-zinc-800">
                            <div
                              className="h-full rounded-full bg-emerald-500 transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-4 flex flex-col items-center justify-center py-6 text-center">
                    <Target className="mb-2 h-5 w-5 text-slate-600" />
                    <p className="text-xs text-slate-500">
                      No active targets yet
                    </p>
                    <button
                      type="button"
                      onClick={() => router.push('/dashboard/performance')}
                      className="mt-2 text-xs text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
                    >
                      Set one in Performance
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Row 2: Hero revenue card */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden rounded-2xl border border-zinc-800/60 bg-gradient-to-br from-zinc-950 via-zinc-950 to-emerald-950/20 p-6 cursor-pointer group transition-all hover:border-emerald-500/30"
            onClick={() => router.push('/dashboard/performance')}
          >
            <div className="pointer-events-none absolute right-[-80px] top-[-80px] h-96 w-96 rounded-full bg-emerald-500/[0.03] blur-3xl" />
            <div className="relative flex items-start justify-between gap-6">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Total Revenue
                </div>
                <div className="mt-2 text-5xl font-bold tracking-tighter text-white">
                  {kpis ? (
                    <AnimatedNumber
                      value={kpis.revenue}
                      prefix={
                        new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: org?.currency ?? 'USD',
                          maximumFractionDigits: 0,
                        })
                          .formatToParts(0)
                          .find((part) => part.type === 'currency')?.value ?? '$'
                      }
                      options={{
                        style: 'currency',
                        currency: org?.currency ?? 'USD',
                        maximumFractionDigits: 0,
                      }}
                    />
                  ) : (
                    '—'
                  )}
                </div>
                <div className="mt-2 flex items-center gap-3">
                  {kpis?.changes.revenuePct != null && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold',
                        kpis.changes.revenuePct >= 0
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-rose-500/10 text-rose-400',
                      )}
                    >
                      {kpis.changes.revenuePct >= 0 ? '↑' : '↓'}{' '}
                      {Math.abs(kpis.changes.revenuePct).toFixed(1)}%
                    </span>
                  )}
                  <span className="text-xs text-slate-500">vs {periodLabel}</span>
                </div>
              </div>

              <div className="h-20 w-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="heroGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#10B981"
                      strokeWidth={2}
                      fill="url(#heroGradient)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1 text-[11px] text-slate-600 group-hover:text-emerald-400 transition-colors">
              <span>Deep dive into performance</span>
              <ChevronRight className="h-3 w-3" />
            </div>
          </motion.div>

          {/* Row 3: Secondary metrics */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="grid grid-cols-1 gap-4 md:grid-cols-3"
          >
            {/* Staff Costs */}
            <div
              role="button"
              tabIndex={0}
              className="rounded-2xl border border-zinc-800/60 bg-zinc-950/80 p-5 transition-all duration-300 hover:border-zinc-700/80 cursor-pointer group"
              onClick={() => router.push('/dashboard/performance')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  router.push('/dashboard/performance');
                }
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Staff Costs
                </span>
                {renderKpiChange(laborChange, false)}
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tighter text-white">
                {kpis ? (
                  <AnimatedNumber
                    value={kpis.laborCost}
                    prefix={
                      new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: org?.currency ?? 'USD',
                        maximumFractionDigits: 0,
                      })
                        .formatToParts(0)
                        .find((part) => part.type === 'currency')?.value ?? '$'
                    }
                    options={{
                      style: 'currency',
                      currency: org?.currency ?? 'USD',
                      maximumFractionDigits: 0,
                    }}
                  />
                ) : (
                  '—'
                )}
              </div>
              {benchmark && kpis && kpis.revenue > 0 && (
                <div className="mt-2 text-[11px] text-slate-600">
                  Industry avg: {benchmark.median_staff_cost_pct.toFixed(0)}% of revenue
                  {(() => {
                    const userPct = (kpis.laborCost / kpis.revenue) * 100;
                    const diff = userPct - benchmark.median_staff_cost_pct;
                    if (Number.isNaN(userPct)) return '';
                    if (Math.abs(diff) < 2) return ' · On track';
                    if (diff > 0) return ` · ${diff.toFixed(0)}% above avg`;
                    return ` · ${Math.abs(diff).toFixed(0)}% below avg`;
                  })()}
                </div>
              )}
            </div>

            {/* Capacity */}
            <div className="rounded-2xl border border-zinc-800/60 bg-zinc-950/80 p-5 transition-all duration-300 hover:border-zinc-700/80 group">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-slate-500">
                  Capacity
                  <span
                    className="cursor-help text-slate-500"
                    title="How full your classes, rooms, or tables are on average"
                  >
                    <Info className="h-3 w-3" />
                  </span>
                </span>
                {renderKpiChange(capacityChange, true)}
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tighter text-white">
                {kpis ? (
                  <AnimatedNumber
                    value={kpis.utilization}
                    suffix="%"
                    options={{ maximumFractionDigits: 0 }}
                  />
                ) : (
                  '—'
                )}
              </div>
              {benchmark && benchmark.median_capacity > 0 && (
                <div className="mt-2 text-[11px] text-slate-600">
                  Industry avg: {benchmark.median_capacity.toFixed(0)}%
                </div>
              )}
            </div>

            {/* Forecast */}
            <div className="rounded-2xl border border-zinc-800/60 bg-zinc-950/80 p-5 transition-all duration-300 hover:border-zinc-700/80 group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Revenue Forecast
                </span>
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tighter text-white">
                {kpis?.forecast ? (
                  <AnimatedNumber
                    value={kpis.forecast}
                    prefix={
                      new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: org?.currency ?? 'USD',
                        maximumFractionDigits: 0,
                      })
                        .formatToParts(0)
                        .find((part) => part.type === 'currency')?.value ?? '$'
                    }
                    options={{
                      style: 'currency',
                      currency: org?.currency ?? 'USD',
                      maximumFractionDigits: 0,
                    }}
                  />
                ) : (
                  '—'
                )}
              </div>
              <div className="mt-2 text-[11px] text-slate-600">
                Based on the current period&apos;s trend.
              </div>
            </div>
          </motion.div>

          {/* AI Spotlight */}
          {hasSeries && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.5,
                delay: 0.15,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="rounded-2xl border border-emerald-500/10 bg-gradient-to-r from-emerald-950/20 via-zinc-950 to-zinc-950 p-5"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                  <Zap className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wider text-emerald-400">
                    AI Briefing
                  </div>
                  {spotlightLoading ? (
                    <div className="space-y-2">
                      <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-800" />
                      <div className="h-4 w-1/2 animate-pulse rounded bg-zinc-800" />
                    </div>
                  ) : spotlight ? (
                    <RichSpotlight
                      text={spotlight}
                      onNavigate={(path) => router.push(path)}
                    />
                  ) : (
                    <p className="text-sm text-slate-500">
                      Upload data to get your daily AI briefing.
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Row 4: Main chart */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl border border-zinc-800/60 bg-zinc-950/80 p-6"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-white">
                  Revenue &amp; Staff Costs
                </div>
                <div className="mt-0.5 text-[11px] text-slate-600">
                  {format(new Date(range.start), 'MMM d')} —{' '}
                  {format(new Date(range.end), 'MMM d, yyyy')}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-[11px] text-slate-500">Revenue</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-slate-500" />
                  <span className="text-[11px] text-slate-500">Staff Costs</span>
                </div>
              </div>
            </div>

            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 4, right: 4, bottom: 0, left: -12 }}
                >
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10B981" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="laborGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#64748B" stopOpacity={0.1} />
                      <stop offset="100%" stopColor="#64748B" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="#18181B"
                    strokeDasharray="none"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="dateLabel"
                    stroke="none"
                    tick={{ fill: '#52525B', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="none"
                    tick={{ fill: '#3F3F46', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) =>
                      Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(0)}k` : v
                    }
                  />
                  {
                    // @ts-ignore Recharts Tooltip typing is overly restrictive for styled usage
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#09090B',
                        border: '1px solid #27272A',
                        borderRadius: 12,
                        padding: '10px 14px',
                        boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
                      }}
                      labelStyle={{
                        color: '#71717A',
                        fontSize: 11,
                        marginBottom: 6,
                      }}
                      itemStyle={{ color: '#e2e8f0', fontSize: 12, padding: 0 }}
                      cursor={{ stroke: '#27272A', strokeWidth: 1 }}
                    />
                  }
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke="#10B981"
                    strokeWidth={2}
                    fill="url(#revenueGrad)"
                    dot={false}
                    activeDot={{
                      r: 4,
                      fill: '#10B981',
                      stroke: '#0A0A0A',
                      strokeWidth: 2,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="labor"
                    name="Staff Costs"
                    stroke="#475569"
                    strokeWidth={1.5}
                    fill="url(#laborGrad)"
                    dot={false}
                    activeDot={{
                      r: 3,
                      fill: '#475569',
                      stroke: '#0A0A0A',
                      strokeWidth: 2,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}

