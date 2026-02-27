'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Sparkles, Info, LayoutGrid } from 'lucide-react';
import { format, subDays } from 'date-fns';

import { useUser } from '@/hooks/use-user';
import { useOrg } from '@/hooks/use-org';
import { useKpis } from '@/hooks/use-kpis';
import { useBenchmarks } from '@/hooks/use-benchmarks';
import { useRealtimeTable } from '@/hooks/use-realtime';
import { toast } from 'sonner';
import { AnimatedNumber } from '@/components/shared/animated-number';
import type { DateRange, Period } from '@/lib/data/aggregator';

type RangePreset = '7d' | '30d' | '90d';

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
  const { profile } = useUser();
  const { org, isGroup, viewMode, activeOrgIds, childOrgs } = useOrg();

  const initial = useMemo(getInitialRange, []);
  const [period, setPeriod] = useState<Period>(initial.period);
  const [preset, setPreset] = useState<RangePreset>(initial.preset);
  const [range, setRange] = useState<DateRange>(initial.range);
  const [refreshKey, setRefreshKey] = useState(0);

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

  const handlePresetChange = (nextPreset: RangePreset) => {
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
  };

  const hasSeries = (kpis?.series?.length ?? 0) > 0;
  const isEmpty = !isLoading && (!kpis || !hasSeries);

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

  const formatCurrency = (value: number): string =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: org?.currency ?? 'USD',
      maximumFractionDigits: 0,
    }).format(value);

  const formatPercent = (value: number): string =>
    `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;

  const periodLabel =
    preset === '7d' ? 'last week' : preset === '30d' ? 'last month' : 'last quarter';

  const chartData =
    kpis?.series.map((point) => ({
      dateLabel: format(new Date(point.date), 'MMM d'),
      revenue: point.revenue ?? 0,
      labor: point.laborCost ?? 0,
    })) ?? [];

  return (
    <div className="relative space-y-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-emerald-500/[0.02] to-transparent" />
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tighter">
            {greeting}{greetingSuffix} {greetingName}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Here&apos;s how your business is doing.
          </p>
          {isGroup && viewMode === 'portfolio' && childOrgs.length > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5">
              <LayoutGrid className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="text-xs text-emerald-400">
                Viewing all {childOrgs.length} businesses combined
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-2xl border border-zinc-800 bg-zinc-950 p-1 text-xs text-slate-300">
            {(['7d', '30d', '90d'] as RangePreset[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handlePresetChange(option)}
                className={`rounded-2xl px-3 py-1 ${
                  preset === option ? 'bg-zinc-900 text-slate-100' : 'text-slate-400'
                }`}
              >
                {option === '7d' && 'This week'}
                {option === '30d' && 'This month'}
                {option === '90d' && 'This quarter'}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-1.5 text-xs text-slate-200 hover:bg-zinc-900"
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

      {isLoading && !kpis ? (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 animate-pulse"
              >
                <div className="h-3 w-16 rounded-full bg-zinc-800" />
                <div className="mt-4 h-8 w-32 rounded-full bg-zinc-800" />
                <div className="mt-3 h-3 w-24 rounded-full bg-zinc-900" />
              </div>
            ))}
          </div>
          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8 animate-pulse">
            <div className="mb-6 h-4 w-40 rounded-full bg-zinc-800" />
            <div className="h-96 rounded-2xl bg-zinc-900" />
          </div>
        </>
      ) : isEmpty ? (
        <div className="mt-10 flex justify-center">
          <div className="flex max-w-md flex-col items-center justify-center rounded-3xl border border-zinc-800 bg-zinc-950 px-10 py-12 text-center shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10">
              <Sparkles className="h-6 w-6 text-emerald-400" />
            </div>
            <h2 className="text-lg font-semibold tracking-tight">Let&apos;s get your numbers in here</h2>
            <p className="mt-2 text-sm text-slate-400">
              Connect a spreadsheet or paste a Google Sheets link, and Aether will start tracking
              your revenue, costs, and performance automatically.
            </p>
            <button
              type="button"
              className="mt-6 rounded-3xl bg-emerald-500 px-6 py-3 text-sm font-medium text-slate-950 hover:bg-emerald-600 transition shadow-[0_0_20px_rgba(16,185,129,0.15)]"
              onClick={() => {
                window.location.href = '/dashboard/data';
              }}
            >
              Connect Your Data
            </button>
            <p className="mt-3 text-xs text-slate-500">Takes about 2 minutes</p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 transition-all hover:border-emerald-500/30">
              <div className="text-sm text-slate-400">Revenue</div>
              <div className="mt-3 text-4xl font-semibold tracking-tighter">
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
              <div className="mt-1 text-sm">
                {kpis?.changes.revenuePct != null ? (
                  <span
                    className={
                      kpis.changes.revenuePct > 0
                        ? 'text-emerald-400'
                        : kpis.changes.revenuePct < 0
                          ? 'text-rose-400'
                          : 'text-slate-500'
                    }
                  >
                    {formatPercent(kpis.changes.revenuePct)} from {periodLabel}
                  </span>
                ) : (
                  <span className="text-slate-500">No prior period yet</span>
                )}
              </div>
              {benchmark && benchmark.median_monthly_revenue > 0 && (
                <div className="mt-1 text-[11px] text-slate-500">
                  Industry median:{' '}
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: org?.currency ?? 'USD',
                    maximumFractionDigits: 0,
                  }).format(benchmark.median_monthly_revenue)}
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 transition-all hover:border-emerald-500/30">
              <div className="text-sm text-slate-400">Staff Costs</div>
              <div className="mt-3 text-4xl font-semibold tracking-tighter">
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
              <div className="mt-1 text-sm">
                {kpis?.changes.laborCostPct != null ? (
                  <span
                    className={
                      kpis.changes.laborCostPct > 0
                        ? 'text-rose-400'
                        : kpis.changes.laborCostPct < 0
                          ? 'text-emerald-400'
                          : 'text-slate-500'
                    }
                  >
                    {formatPercent(kpis.changes.laborCostPct)} from {periodLabel}
                  </span>
                ) : (
                  <span className="text-slate-500">No prior period yet</span>
                )}
              </div>
              {benchmark && kpis && kpis.revenue > 0 && (
                <div className="mt-1 text-[11px] text-slate-500">
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

            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 transition-all hover:border-emerald-500/30">
              <div className="flex items-center gap-1.5 text-sm text-slate-400">
                Capacity
                <span
                  className="text-slate-500 cursor-help"
                  title="How full your classes, rooms, or tables are on average"
                >
                  <Info className="h-3 w-3" />
                </span>
              </div>
              <div className="mt-3 text-4xl font-semibold tracking-tighter">
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
              <div className="mt-1 text-sm">
                {kpis?.changes.utilizationPct != null ? (
                  <span
                    className={
                      kpis.changes.utilizationPct > 0
                        ? 'text-emerald-400'
                        : kpis.changes.utilizationPct < 0
                          ? 'text-rose-400'
                          : 'text-slate-500'
                    }
                  >
                    {formatPercent(kpis.changes.utilizationPct)} from {periodLabel}
                  </span>
                ) : (
                  <span className="text-slate-500">No prior period yet</span>
                )}
              </div>
              {benchmark && benchmark.median_capacity > 0 && (
                <div className="mt-1 text-[11px] text-slate-500">
                  Industry avg: {benchmark.median_capacity.toFixed(0)}%
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 transition-all hover:border-emerald-500/30">
              <div className="text-sm text-slate-400">Revenue Forecast</div>
              <div className="mt-3 text-4xl font-semibold tracking-tighter">
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
              <div className="mt-1 text-sm text-slate-500">
                Based on the current period&apos;s trend
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
            <div className="mb-6 flex items-center justify-between">
              <div className="font-medium">Revenue &amp; Staff Costs</div>
              <div className="text-xs text-slate-500">
                {range.start} → {range.end}
              </div>
            </div>
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                >
                  <CartesianGrid stroke="#27272A" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="dateLabel"
                    stroke="#52525B"
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis stroke="#52525B" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181B',
                      border: '1px solid #27272A',
                      borderRadius: 16,
                      color: '#e2e8f0',
                      fontSize: 12,
                      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    }}
                    labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
                  />
                  <Area
                    type="natural"
                    dataKey="revenue"
                    stackId="1"
                    stroke="#10B981"
                    fill="#10B981"
                    fillOpacity={0.2}
                  />
                  <Area
                    type="natural"
                    dataKey="labor"
                    stackId="2"
                    stroke="#64748B"
                    fill="#64748B"
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
