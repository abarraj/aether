// "Why this number?" transparency panel for each metric.
// Shows formula, source datasets, row count, dataset version, computed_at.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Database,
  Clock,
  Hash,
  Info,
  AlertTriangle,
} from 'lucide-react';

import { cn } from '@/lib/utils';

interface MetricDefinition {
  metric_key: string;
  name: string;
  formula: string;
  description: string | null;
  category: string;
  unit: string;
  is_derived: boolean;
  source_metrics: string[] | null;
}

interface Source {
  id: string;
  fileName: string;
  dataType: string;
  rowCount: number | null;
  uploadedAt: string;
  streamName: string | null;
}

interface ExplainData {
  definition: MetricDefinition | null;
  snapshot: {
    periodStart: string;
    periodEnd: string;
    value: number | null;
    computedAt: string;
    datasetVersion: string | null;
  } | null;
  sources: Source[];
  computeRun: {
    rowsProcessed: number | null;
    durationMs: number | null;
    finishedAt: string | null;
  } | null;
  totalRows: number;
  coverageNote: string | null;
}

interface MetricTransparencyProps {
  metricKey: string;
  metricLabel: string;
  period: string;
  periodStart?: string;
}

export function MetricTransparency({
  metricKey,
  metricLabel,
  period,
  periodStart,
}: MetricTransparencyProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<ExplainData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchExplanation = useCallback(async () => {
    if (data) return; // already loaded
    setIsLoading(true);

    try {
      const params = new URLSearchParams({ metric_key: metricKey, period });
      if (periodStart) params.set('period_start', periodStart);

      const res = await fetch(`/api/metrics/explain?${params.toString()}`);
      if (res.ok) {
        const json = (await res.json()) as ExplainData;
        setData(json);
      }
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  }, [metricKey, period, periodStart, data]);

  const handleToggle = useCallback(() => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) {
      void fetchExplanation();
    }
  }, [isOpen, fetchExplanation]);

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={handleToggle}
        className="group inline-flex items-center gap-1 text-[10px] text-slate-600 transition-colors hover:text-slate-400"
      >
        <Info className="h-3 w-3" />
        <span>Why this number?</span>
        {isOpen ? (
          <ChevronUp className="h-2.5 w-2.5" />
        ) : (
          <ChevronDown className="h-2.5 w-2.5" />
        )}
      </button>

      {isOpen && (
        <div className="mt-2 rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-3 text-[11px] text-slate-400 space-y-2.5 animate-in fade-in duration-200">
          {isLoading && (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 animate-spin rounded-full border border-slate-600 border-t-slate-400" />
              <span>Loading explanation...</span>
            </div>
          )}

          {data && (
            <>
              {/* Formula */}
              {data.definition && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                    <Hash className="h-3 w-3" />
                    Formula
                  </div>
                  <code className="block rounded-lg bg-zinc-800/60 px-2.5 py-1.5 font-mono text-[10px] text-slate-300">
                    {data.definition.formula}
                  </code>
                  {data.definition.description && (
                    <p className="text-slate-500 leading-relaxed">
                      {data.definition.description}
                    </p>
                  )}
                </div>
              )}

              {/* Snapshot details */}
              {data.snapshot && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                    <Clock className="h-3 w-3" />
                    Computation
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px]">
                    <span>
                      Period: {format(new Date(data.snapshot.periodStart), 'MMM d')}
                      {data.snapshot.periodStart !== data.snapshot.periodEnd && (
                        <> &ndash; {format(new Date(data.snapshot.periodEnd), 'MMM d, yyyy')}</>
                      )}
                    </span>
                    <span>
                      Computed: {formatDistanceToNow(new Date(data.snapshot.computedAt), { addSuffix: true })}
                    </span>
                    {data.snapshot.datasetVersion && (
                      <span>
                        Version: <code className="text-slate-500">{data.snapshot.datasetVersion}</code>
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Source datasets */}
              {data.sources.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                    <Database className="h-3 w-3" />
                    Source Data ({data.totalRows.toLocaleString()} rows)
                  </div>
                  <div className="space-y-1">
                    {data.sources.map((source) => (
                      <div
                        key={source.id}
                        className="flex items-center gap-2 rounded-lg bg-zinc-800/40 px-2 py-1"
                      >
                        <FileText className="h-3 w-3 flex-shrink-0 text-slate-600" />
                        <span className="truncate">
                          {source.streamName ? (
                            <span className="text-slate-300">{source.streamName}</span>
                          ) : (
                            <span className="text-slate-300">{source.fileName}</span>
                          )}
                        </span>
                        {source.rowCount != null && (
                          <span className="ml-auto flex-shrink-0 text-slate-600">
                            {source.rowCount.toLocaleString()} rows
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Compute run stats */}
              {data.computeRun && (
                <div className="flex gap-x-4 text-[10px] text-slate-600">
                  {data.computeRun.rowsProcessed != null && (
                    <span>{data.computeRun.rowsProcessed.toLocaleString()} rows processed</span>
                  )}
                  {data.computeRun.durationMs != null && (
                    <span>{data.computeRun.durationMs}ms compute time</span>
                  )}
                </div>
              )}

              {/* Coverage warning */}
              {data.coverageNote && (
                <div className="flex items-start gap-1.5 rounded-lg bg-amber-500/5 border border-amber-500/10 px-2.5 py-1.5 text-amber-400/80">
                  <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span>{data.coverageNote}</span>
                </div>
              )}

              {/* Derived metric sources */}
              {data.definition?.is_derived && data.definition.source_metrics && data.definition.source_metrics.length > 0 && (
                <div className="text-[10px] text-slate-600">
                  Derived from: {data.definition.source_metrics.join(', ')}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
