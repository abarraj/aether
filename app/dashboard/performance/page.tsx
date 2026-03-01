'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingDown,
  TrendingUp,
  ChevronRight,
  X,
  BarChart3,
  Sparkles,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts';
import { useUser } from '@/hooks/use-user';
import { useOrg } from '@/hooks/use-org';
import { cn } from '@/lib/utils';

type EntitySummary = {
  field: string;
  value: string;
  totalActual: number;
  totalExpected: number;
  totalGap: number;
  weekCount: number;
  avgGapPct: number | null;
  trend: number[];
};

type MatrixData = {
  weeks: string[];
  dimensions: { field: string; values: string[] }[];
  matrix: Record<
    string,
    Record<
      string,
      Record<
        string,
        { actual: number; expected: number; gap: number; pct: number | null }
      >
    >
  >;
  entities: EntitySummary[];
  summary: {
    totalLeakage: number;
    dimensionCount: number;
    entityCount: number;
    weekCount: number;
    bestPerformer: {
      value: string;
      field: string;
      gap: number;
    } | null;
    worstPerformer: {
      value: string;
      field: string;
      gap: number;
    } | null;
  } | null;
};

function getGapCellClass(pct: number | null): string {
  if (pct == null) return 'bg-zinc-900/30';
  if (pct <= 0) return 'bg-emerald-500/80';
  if (pct < 15) return 'bg-emerald-500/40';
  if (pct < 30) return 'bg-amber-500/50';
  if (pct < 50) return 'bg-orange-500/50';
  return 'bg-rose-500/60';
}

function getGapBarColor(pct: number | null): string {
  if (pct == null || pct <= 0) return '#10b981';
  if (pct < 15) return '#10b981';
  if (pct < 30) return '#f59e0b';
  return '#f43f5e';
}

function formatDimensionLabel(field: string): string {
  return field
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function PerformancePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { org } = useUser();
  const { org: orgFromOrg } = useOrg();
  const effectiveOrg = org ?? orgFromOrg;

  const [data, setData] = useState<MatrixData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadsExist, setUploadsExist] = useState(false);
  const [activeDimension, setActiveDimension] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<EntitySummary | null>(
    null,
  );
  const [tooltip, setTooltip] = useState<{
    left: number;
    top: number;
    entity: string;
    week: string;
    actual: number;
    expected: number;
    gap: number;
    pct: number | null;
  } | null>(null);

  useEffect(() => {
    fetch('/api/metrics/gaps/matrix')
      .then((res) => (res.ok ? res.json() : null))
      .then((raw) => {
        if (raw && Array.isArray(raw.weeks)) {
          setData(raw as MatrixData);
          if (
            !activeDimension &&
            raw.dimensions?.length > 0 &&
            raw.dimensions[0]?.field
          ) {
            setActiveDimension(raw.dimensions[0].field);
          }
        } else {
          setData(null);
        }
      })
      .catch(() => setData(null))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!effectiveOrg) return;
    const check = async () => {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { count } = await supabase
        .from('uploads')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', effectiveOrg.id)
        .eq('status', 'ready');
      setUploadsExist((count ?? 0) > 0);
    };
    check();
  }, [effectiveOrg]);

  useEffect(() => {
    if (data?.dimensions?.length && !activeDimension) {
      setActiveDimension(data.dimensions[0].field);
    }
  }, [data, activeDimension]);

  useEffect(() => {
    if (!data?.entities || data.entities.length === 0) return;
    const entityParam = searchParams.get('entity');
    if (entityParam) {
      const match = data.entities.find(
        (e) => e.value.toLowerCase() === entityParam.toLowerCase(),
      );
      if (match) {
        setActiveDimension(match.field);
        setSelectedEntity(match);
      }
    }
  }, [data, searchParams]);

  const formatCurrency = useCallback(
    (value: number): string =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: effectiveOrg?.currency ?? 'USD',
        maximumFractionDigits: 0,
      }).format(value),
    [effectiveOrg?.currency],
  );

  const dimensionValues = useMemo(() => {
    if (!data || !activeDimension) return [];
    const dim = data.dimensions.find((d) => d.field === activeDimension);
    return dim?.values ?? [];
  }, [data, activeDimension]);

  const entitiesForDimension = useMemo(() => {
    if (!data?.entities) return [];
    return data.entities.filter((e) => e.field === activeDimension);
  }, [data?.entities, activeDimension]);

  const isEmpty =
    !data ||
    (data.entities?.length ?? 0) === 0 ||
    (data.weeks?.length ?? 0) === 0;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedEntity(null);
    },
    [],
  );
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-500" />
          <p className="text-sm text-slate-500">Loading performance data…</p>
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <motion.div
        className="flex min-h-[60vh] items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex max-w-md flex-col items-center rounded-2xl border border-zinc-800 bg-zinc-950/80 px-10 py-12 text-center shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-800/80">
            <BarChart3 className="h-7 w-7 text-slate-400" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-100">
            {uploadsExist
              ? 'Performance data processing'
              : 'Performance data loading'}
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            {uploadsExist
              ? 'Your data is connected. Delete and re-upload your spreadsheet to generate performance insights.'
              : "Upload a spreadsheet with revenue data to see where you're leaving money on the table."}
          </p>
          <button
            type="button"
            onClick={() => router.push('/dashboard/data')}
            className="mt-6 rounded-2xl bg-emerald-500 px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-emerald-600"
          >
            {uploadsExist ? 'Go to Connected Data' : 'Connect Data'}
          </button>
        </div>
      </motion.div>
    );
  }

  const summary = data!.summary!;

  return (
    <div className="space-y-8 pb-12">
      {/* Section 1: Summary cards */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="rounded-2xl border border-zinc-800/60 bg-gradient-to-br from-zinc-950 via-zinc-950 to-rose-950/20 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Total leakage
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tighter text-rose-400">
            {formatCurrency(summary.totalLeakage)}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            across {summary.weekCount} weeks
          </p>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="mt-1 flex items-center gap-1 text-[11px] text-slate-600 hover:text-emerald-400 transition-colors"
          >
            <span>← Back to dashboard</span>
          </button>
        </div>
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-950/80 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Worst performer
          </p>
          <p className="mt-1 text-xl font-bold tracking-tighter text-slate-100">
            {summary.worstPerformer?.value ?? '—'}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
            {summary.worstPerformer != null && (
              <>
                <span className="inline-flex items-center rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-rose-400">
                  {formatCurrency(summary.worstPerformer.gap)} gap
                </span>
                <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
              </>
            )}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-950/80 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Best performer
          </p>
          <p className="mt-1 text-xl font-bold tracking-tighter text-slate-100">
            {summary.bestPerformer?.value ?? '—'}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
            {summary.bestPerformer != null && (
              <>
                <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-400">
                  {formatCurrency(summary.bestPerformer.gap)} gap
                </span>
                <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
              </>
            )}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-950/80 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Dimensions
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tighter text-slate-100">
            {summary.dimensionCount} dimension{summary.dimensionCount !== 1 ? 's' : ''}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {summary.weekCount} weeks
          </p>
        </div>
      </motion.div>

      {/* Section 2: Dimension tabs */}
      {data!.dimensions.length > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-1"
        >
          <div className="flex flex-wrap gap-0.5">
            {data!.dimensions.map((d) => (
              <button
                key={d.field}
                type="button"
                onClick={() => setActiveDimension(d.field)}
                className={cn(
                  'rounded-xl px-4 py-2 text-sm font-medium transition',
                  activeDimension === d.field
                    ? 'bg-zinc-800 text-white'
                    : 'text-slate-400 hover:bg-zinc-900 hover:text-slate-200',
                )}
              >
                {formatDimensionLabel(d.field)}
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Section 3: Heatmap */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-x-auto"
      >
        <div className="min-w-[600px] rounded-2xl border border-zinc-800/60 bg-zinc-950/80 p-4">
          <p className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500">
            Performance heatmap — gap % by week
          </p>
          <div
            className="inline-grid gap-0.5"
            style={{
              gridTemplateColumns: `minmax(120px, auto) repeat(${data!.weeks.length}, minmax(0, 3.5rem))`,
              gridTemplateRows: `auto repeat(${dimensionValues.length}, minmax(2.5rem, auto))`,
            }}
          >
            <div className="rounded-lg bg-transparent" />
            {data!.weeks.map((w) => (
              <div
                key={w}
                className="rounded-lg bg-zinc-900/50 px-1 py-2 text-center text-[10px] font-medium text-slate-400"
              >
                {format(parseISO(w), 'MMM d')}
              </div>
            ))}
            {dimensionValues.map((val) => (
              <React.Fragment key={val}>
                <button
                  type="button"
                  onClick={() => {
                    const ent = entitiesForDimension.find(
                      (e) => e.value === val && e.field === activeDimension,
                    );
                    if (ent) setSelectedEntity(ent);
                  }}
                  className="rounded-lg bg-transparent py-2 pr-2 text-left text-xs font-medium text-slate-200 hover:bg-zinc-800/50"
                >
                  {val}
                </button>
                {data!.weeks.map((week) => {
                  const cell =
                    data!.matrix[activeDimension!]?.[val]?.[week];
                  const pct = cell?.pct ?? null;
                  return (
                    <div
                      key={week}
                      className={cn(
                        'm-0.5 h-10 w-14 rounded-lg',
                        getGapCellClass(pct),
                      )}
                      onMouseEnter={(e) => {
                        const pad = 12;
                        const tw = 220;
                        const th = 120;
                        let left = e.clientX + 12;
                        let top = e.clientY - th - 8;
                        if (left + tw > window.innerWidth - pad)
                          left = window.innerWidth - pad - tw;
                        if (left < pad) left = pad;
                        if (top < pad) top = e.clientY + 12;
                        if (top + th > window.innerHeight - pad)
                          top = window.innerHeight - pad - th;
                        setTooltip({
                          left,
                          top,
                          entity: val,
                          week,
                          actual: cell?.actual ?? 0,
                          expected: cell?.expected ?? 0,
                          gap: cell?.gap ?? 0,
                          pct,
                        });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          {tooltip && (
            <div
              className="pointer-events-none fixed z-50 w-[220px] rounded-xl border border-zinc-700 bg-zinc-900 p-3 shadow-2xl"
              style={{ left: tooltip.left, top: tooltip.top }}
            >
              <p className="font-semibold text-slate-100">{tooltip.entity}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Week of {format(parseISO(tooltip.week), 'MMM d')}
              </p>
              <div className="mt-2 space-y-0.5 text-xs text-slate-300">
                <p>Actual: {formatCurrency(tooltip.actual)}</p>
                <p>Expected: {formatCurrency(tooltip.expected)}</p>
                <p>
                  Gap: {formatCurrency(tooltip.gap)}
                  {tooltip.pct != null ? ` (${tooltip.pct.toFixed(1)}%)` : ''}
                </p>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Section 4: Entity leaderboard */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl border border-zinc-800/60 bg-zinc-950/80 p-5"
      >
        <p className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500">
          Entity leaderboard
        </p>
        <div className="space-y-3">
          {entitiesForDimension.map((entity, idx) => {
            const fillPct =
              entity.totalExpected > 0
                ? Math.min(
                    100,
                    (entity.totalActual / entity.totalExpected) * 100,
                  )
                : 0;
            const rankClass =
              idx === 0
                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                : idx <= 2
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : 'bg-zinc-800 text-slate-400 border-zinc-700';
            return (
              <button
                key={`${entity.field}::${entity.value}`}
                type="button"
                onClick={() => setSelectedEntity(entity)}
                className="flex w-full items-center gap-4 rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4 text-left transition hover:bg-zinc-800/60"
              >
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-bold',
                    rankClass,
                  )}
                >
                  #{idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-100">
                    {entity.value}
                  </p>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-rose-500/20">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${fillPct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {formatCurrency(entity.totalActual)} actual ·{' '}
                    {formatCurrency(entity.totalExpected)} expected ·{' '}
                    <span className="text-rose-400">
                      {formatCurrency(entity.totalGap)} gap
                      {entity.avgGapPct != null
                        ? ` (${entity.avgGapPct.toFixed(1)}%)`
                        : ''}
                    </span>
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Section 5: Drill-down panel */}
      <AnimatePresence>
        {selectedEntity && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedEntity(null)}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:bg-black/30"
              aria-hidden="true"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-zinc-800 bg-[#0A0A0A] shadow-2xl lg:w-[480px]"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 p-4">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-slate-100">
                    {selectedEntity.value}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {formatDimensionLabel(selectedEntity.field)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedEntity(null)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-zinc-800 hover:text-slate-200"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-zinc-800 bg-emerald-500/5 p-4">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                      Total revenue
                    </p>
                    <p className="mt-1 text-xl font-bold text-emerald-400">
                      {formatCurrency(selectedEntity.totalActual)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-rose-500/5 p-4">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                      Revenue gap
                    </p>
                    <p className="mt-1 text-xl font-bold text-rose-400">
                      {formatCurrency(selectedEntity.totalGap)}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                    Weekly gap trend
                  </p>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={data!.weeks.map((w, i) => ({
                          week: format(parseISO(w), 'MMM d'),
                          gap: selectedEntity.trend[i] ?? 0,
                          pct:
                            selectedEntity.totalExpected > 0
                              ? ((selectedEntity.trend[i] ?? 0) /
                                  selectedEntity.totalExpected) *
                                100
                              : null,
                        }))}
                        margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                      >
                        <XAxis
                          dataKey="week"
                          tick={{ fontSize: 10, fill: '#94a3b8' }}
                          axisLine={{ stroke: '#3f3f46' }}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: '#94a3b8' }}
                          axisLine={{ stroke: '#3f3f46' }}
                          tickFormatter={(v) =>
                            `${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`
                          }
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#18181b',
                            border: '1px solid #3f3f46',
                            borderRadius: '12px',
                          }}
                          formatter={(value: number | undefined) => [
                            value != null ? formatCurrency(value) : '—',
                            'Gap',
                          ]}
                          labelFormatter={(label) => `Week of ${label}`}
                        />
                        <Bar dataKey="gap" radius={[4, 4, 0, 0]}>
                          {data!.weeks.map((_, i) => {
                            const pct =
                              selectedEntity.totalExpected > 0
                                ? ((selectedEntity.trend[i] ?? 0) /
                                    selectedEntity.totalExpected) *
                                  100
                                : null;
                            return (
                              <Cell
                                key={i}
                                fill={getGapBarColor(pct)}
                              />
                            );
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div>
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                    Week by week
                  </p>
                  <div className="overflow-hidden rounded-xl border border-zinc-800">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-zinc-800 bg-zinc-900/80">
                          <th className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                            Week
                          </th>
                          <th className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                            Actual
                          </th>
                          <th className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                            Expected
                          </th>
                          <th className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                            Gap
                          </th>
                          <th className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                            Gap %
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data!.weeks.map((w, i) => {
                          const cell =
                            data!.matrix[selectedEntity.field]?.[
                              selectedEntity.value
                            ]?.[w];
                          const actual = cell?.actual ?? 0;
                          const expected = cell?.expected ?? 0;
                          const gap = cell?.gap ?? 0;
                          const pct = cell?.pct ?? null;
                          const pctClass =
                            pct == null || pct <= 0
                              ? 'text-emerald-400'
                              : pct < 15
                                ? 'text-emerald-400'
                                : pct < 30
                                  ? 'text-amber-400'
                                  : 'text-rose-400';
                          return (
                            <tr
                              key={w}
                              className="border-b border-zinc-800/60 last:border-0"
                            >
                              <td className="px-3 py-2 text-slate-300">
                                {format(parseISO(w), 'MMM d')}
                              </td>
                              <td className="px-3 py-2 text-slate-300">
                                {formatCurrency(actual)}
                              </td>
                              <td className="px-3 py-2 text-slate-300">
                                {formatCurrency(expected)}
                              </td>
                              <td className="px-3 py-2 text-slate-300">
                                {formatCurrency(gap)}
                              </td>
                              <td className={cn('px-3 py-2 font-medium', pctClass)}>
                                {pct != null ? `${pct.toFixed(1)}%` : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={() => {
                      const entityName = selectedEntity!.value;
                      const gapAmount = Math.round(selectedEntity!.totalGap);
                      router.push(
                        `/dashboard/ai-assistant?prompt=${encodeURIComponent(
                          `Tell me about ${entityName}'s performance. They have a $${gapAmount.toLocaleString()} revenue gap. What's going wrong and what should I do about it?`,
                        )}`,
                      );
                    }}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                  >
                    <Sparkles className="h-4 w-4" />
                    Ask AI about {selectedEntity?.value}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PerformancePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-500" />
        </div>
      }
    >
      <PerformancePageInner />
    </Suspense>
  );
}
