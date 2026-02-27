// Alerts center listing operational alerts and recommendations.
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Info, Wand2 } from 'lucide-react';

import { useUser } from '@/hooks/use-user';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeTable } from '@/hooks/use-realtime';
import { toast } from 'sonner';

type AlertRow = {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical' | string;
  title: string;
  description: string | null;
  data: Record<string, unknown> | null;
  is_read: boolean;
  is_dismissed: boolean;
  created_at: string;
};

type TypeFilter = 'all' | 'anomaly' | 'recommendation' | 'threshold';
type SeverityFilter = 'all' | 'info' | 'warning' | 'critical';

export default function AlertsPage() {
  const { org } = useUser();
  const supabase = createClient();

  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!org) {
        setIsLoading(false);
        return;
      }

      const { data } = await supabase
        .from('alerts')
        .select('id, type, severity, title, description, data, is_read, is_dismissed, created_at')
        .eq('org_id', org.id)
        .order('created_at', { ascending: false })
        .returns<AlertRow[]>();

      setAlerts(data ?? []);
      setIsLoading(false);
    };

    void load();
  }, [org, supabase]);

  useRealtimeTable<AlertRow>(
    'alerts',
    org ? { column: 'org_id', value: org.id } : undefined,
    (payload) => {
      if (payload.eventType === 'INSERT') {
        const alert = payload.new as AlertRow;
        setAlerts((previous: AlertRow[]) => [alert, ...previous]);
        toast(
          `[${alert.severity}] New alert: ${alert.title}`,
        );
      }
    },
  );

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert: AlertRow) => {
      if (alert.is_dismissed) return false;

      if (severityFilter !== 'all' && alert.severity !== severityFilter) {
        return false;
      }

      if (typeFilter === 'all') return true;

      const kind = (() => {
        if (alert.type.includes('anomaly')) return 'anomaly';
        if (
          alert.type === 'revenue_trend' ||
          alert.type === 'labor_optimization' ||
          alert.type === 'schedule_optimization' ||
          alert.type === 'expansion_opportunity'
        ) {
          return 'recommendation';
        }
        if (alert.type.includes('threshold')) return 'threshold';
        return 'anomaly';
      })();

      return kind === typeFilter;
    });
  }, [alerts, typeFilter, severityFilter]);

  const handleMarkRead = async (alert: AlertRow) => {
    if (!org || alert.is_read) return;
    await supabase
      .from('alerts')
      .update({ is_read: true })
      .eq('id', alert.id)
      .eq('org_id', org.id);
    setAlerts((previous: AlertRow[]) =>
      previous.map((item: AlertRow) =>
        item.id === alert.id
          ? {
              ...item,
              is_read: true,
            }
          : item,
      ),
    );
  };

  const handleDismiss = async (alert: AlertRow) => {
    if (!org) return;
    await supabase
      .from('alerts')
      .update({ is_dismissed: true, is_read: true })
      .eq('id', alert.id)
      .eq('org_id', org.id);
    setAlerts((previous: AlertRow[]) => previous.filter((item: AlertRow) => item.id !== alert.id));
    try {
      void fetch('/api/audit/log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'alert.dismiss',
          targetType: 'alert',
          targetId: alert.id,
          description: `Dismissed alert "${alert.title}"`,
          metadata: {
            severity: alert.severity,
            type: alert.type,
          },
        }),
      });
    } catch {
      // Ignore audit logging failures.
    }
  };

  const iconForSeverity = (severity: string) => {
    if (severity === 'critical') {
      return <AlertTriangle className="h-4 w-4 text-rose-400" />;
    }
    if (severity === 'warning') {
      return <AlertTriangle className="h-4 w-4 text-amber-400" />;
    }
    return <Info className="h-4 w-4 text-emerald-400" />;
  };

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-950 px-8 py-6 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
        <h1 className="text-2xl font-semibold tracking-tighter">Alerts</h1>
        <p className="mt-1 text-sm text-slate-400">
          Every anomaly, recommendation, and threshold breach in one calm stream.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-zinc-800 bg-zinc-950 px-6 py-4 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Type</span>
          <div className="inline-flex rounded-2xl border border-zinc-800 bg-zinc-950 p-1">
            {(['all', 'anomaly', 'recommendation', 'threshold'] as TypeFilter[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setTypeFilter(type)}
                className={`rounded-2xl px-3 py-1 ${
                  typeFilter === type ? 'bg-zinc-900 text-slate-100' : 'text-slate-400'
                }`}
              >
                {type === 'all' && 'All'}
                {type === 'anomaly' && 'Anomalies'}
                {type === 'recommendation' && 'Recommendations'}
                {type === 'threshold' && 'Thresholds'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Severity</span>
          <div className="inline-flex rounded-2xl border border-zinc-800 bg-zinc-950 p-1">
            {(['all', 'info', 'warning', 'critical'] as SeverityFilter[]).map((severity) => (
              <button
                key={severity}
                type="button"
                onClick={() => setSeverityFilter(severity)}
                className={`rounded-2xl px-3 py-1 ${
                  severityFilter === severity ? 'bg-zinc-900 text-slate-100' : 'text-slate-400'
                }`}
              >
                {severity === 'all' ? 'All' : severity.charAt(0).toUpperCase() + severity.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 px-6 py-6 text-xs text-slate-500">
            Loading alerts…
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 px-6 py-8 text-center text-xs text-slate-500">
            No alerts yet. Aether will surface recommendations and anomalies here as data flows
            through your workspace.
          </div>
        ) : (
          filteredAlerts.map((alert) => {
            const isExpanded = expandedId === alert.id;
            return (
              <div
                key={alert.id}
                className={`cursor-pointer rounded-3xl border px-6 py-4 text-xs transition-all ${
                  alert.is_read
                    ? 'border-zinc-800 bg-zinc-950'
                    : 'border-emerald-500/40 bg-zinc-950'
                } ${
                  alert.severity === 'critical'
                    ? 'border-l-2 border-l-rose-500/50'
                    : alert.severity === 'warning'
                      ? 'border-l-2 border-l-amber-500/50'
                      : 'border-l-2 border-l-emerald-500/50'
                }`}
                onClick={() => {
                  void handleMarkRead(alert);
                  setExpandedId(isExpanded ? null : alert.id);
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10">
                    {iconForSeverity(alert.severity)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-200">{alert.title}</span>
                      <span className="text-[11px] text-slate-500">
                        {new Date(alert.created_at).toLocaleString()}
                      </span>
                    </div>
                    {!isExpanded && alert.description && (
                      <p className="mt-1 line-clamp-2 text-slate-400">
                        {alert.description}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="text-[11px] text-slate-400 hover:text-slate-200"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDismiss(alert);
                    }}
                  >
                    Dismiss
                  </button>
                </div>

                {isExpanded && (
                  <div className="mt-3 space-y-3">
                    {alert.description && (
                      <p className="text-slate-300">{alert.description}</p>
                    )}
                    {alert.data && Object.keys(alert.data).length > 0 && (
                      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-[11px] text-slate-400">
                        <div className="mb-1 text-slate-500">Details</div>
                        <pre className="whitespace-pre-wrap break-words">
                          {JSON.stringify(alert.data, null, 2)}
                        </pre>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-xs font-medium text-slate-950 hover:bg-emerald-600 active:scale-[0.985]"
                        onClick={(event) => {
                          event.stopPropagation();
                          const url = new URL(window.location.href);
                          url.pathname = '/dashboard/ai-assistant';
                          url.searchParams.set('alert', alert.id);
                          window.location.href = url.toString();
                        }}
                      >
                        <Wand2 className="h-3 w-3" />
                        Discuss with AI
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

