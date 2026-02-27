// Audit log surface: dense, high-signal view over all sensitive Aether activity.

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';

import { useUser } from '@/hooks/use-user';
import { createClient } from '@/lib/supabase/client';

type AuditLogRow = {
  id: string;
  org_id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  description: string;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
};

type ActionGroup = 'all' | 'user' | 'data' | 'settings' | 'org' | 'ai' | 'alert' | 'security';

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function classifyAction(action: string):
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'other' {
  if (
    action === 'user.signup' ||
    action === 'user.invite' ||
    action === 'data.upload' ||
    action === 'api_key.create'
  ) {
    return 'create';
  }

  if (action === 'user.login' || action === 'ai.query' || action === 'export.download') {
    return 'read';
  }

  if (
    action === 'settings.update' ||
    action === 'org.update' ||
    action === 'role.change' ||
    action === 'alert.dismiss'
  ) {
    return 'update';
  }

  if (action === 'data.delete' || action === 'member.remove' || action === 'api_key.revoke') {
    return 'delete';
  }

  return 'other';
}

function actionBadgeClasses(kind: ReturnType<typeof classifyAction>): string {
  switch (kind) {
    case 'create':
      return 'bg-emerald-500/10 text-emerald-400';
    case 'read':
      return 'bg-cyan-500/10 text-cyan-400';
    case 'update':
      return 'bg-amber-500/10 text-amber-400';
    case 'delete':
      return 'bg-rose-500/10 text-rose-400';
    default:
      return 'bg-zinc-800 text-slate-300';
  }
}

function groupForAction(action: string): ActionGroup {
  if (action.startsWith('user.')) return 'user';
  if (action.startsWith('data.')) return 'data';
  if (action.startsWith('settings.')) return 'settings';
  if (action.startsWith('org.')) return 'org';
  if (action.startsWith('ai.')) return 'ai';
  if (action.startsWith('alert.')) return 'alert';
  if (action.startsWith('api_key.')) return 'security';
  return 'all';
}

function buildCsv(events: AuditLogRow[]): string {
  const headers = [
    'timestamp',
    'actor_email',
    'action',
    'target_type',
    'target_id',
    'description',
    'ip_address',
    'metadata',
  ];

  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const asString = typeof value === 'string' ? value : JSON.stringify(value);
    const needsQuotes = /[",\n]/.test(asString);
    if (needsQuotes) {
      return `"${asString.replace(/"/g, '""')}"`;
    }
    return asString;
  };

  const rows = events.map((event) =>
    [
      formatTimestamp(event.created_at),
      event.actor_email ?? '',
      event.action,
      event.target_type ?? '',
      event.target_id ?? '',
      event.description,
      event.ip_address ?? '',
      event.metadata ? JSON.stringify(event.metadata) : '',
    ].map(escape),
  );

  return [headers.join(','), ...rows.map((cells) => cells.join(','))].join('\n');
}

export default function AuditLogSettingsPage() {
  const { org } = useUser();
  const supabase = createClient();

  const [events, setEvents] = useState<AuditLogRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [actionGroup, setActionGroup] = useState<ActionGroup>('all');
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pageSize] = useState<number>(25);
  const [page, setPage] = useState<number>(1);

  useEffect(() => {
    const load = async () => {
      if (!org) {
        setIsLoading(false);
        return;
      }

      const rangeFrom = 0;
      const rangeTo = pageSize * 4 - 1;

      const { data } = await supabase
        .from('audit_log')
        .select(
          'id, org_id, actor_id, actor_email, action, target_type, target_id, description, metadata, ip_address, created_at',
        )
        .eq('org_id', org.id)
        .order('created_at', { ascending: false })
        .range(rangeFrom, rangeTo)
        .returns<AuditLogRow[]>();

      setEvents(data ?? []);
      setIsLoading(false);
    };

    void load();
  }, [org, supabase, pageSize]);

  const filteredEvents = useMemo(() => {
    let result = [...events];

    if (actionGroup !== 'all') {
      result = result.filter((event) => groupForAction(event.action) === actionGroup);
    }

    if (selectedUser !== 'all') {
      result = result.filter((event) => event.actor_email === selectedUser);
    }

    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      result = result.filter((event) => new Date(event.created_at) >= fromDate);
    }

    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setDate(toDate.getDate() + 1);
      result = result.filter((event) => new Date(event.created_at) < toDate);
    }

    if (search.trim()) {
      const needle = search.toLowerCase();
      result = result.filter((event) => {
        const haystack = `${event.description} ${event.actor_email ?? ''}`.toLowerCase();
        return haystack.includes(needle);
      });
    }

    const start = 0;
    const end = page * pageSize;
    return result.slice(start, end);
  }, [events, actionGroup, selectedUser, dateFrom, dateTo, search, page, pageSize]);

  const uniqueUsers = useMemo(() => {
    const emails = new Set<string>();
    events.forEach((event) => {
      if (event.actor_email) {
        emails.add(event.actor_email);
      }
    });
    return Array.from(emails).sort();
  }, [events]);

  const hasMore = filteredEvents.length < events.length;

  const handleExport = () => {
    if (events.length === 0) return;
    const csv = buildCsv(events);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'aether-audit-log.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 px-8 py-6 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
        <div>
          <h1 className="text-2xl font-semibold tracking-tighter">Audit log</h1>
          <p className="mt-1 text-sm text-slate-400">
            A precise, immutable trail of every sensitive change in your workspace.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-zinc-900"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-xs text-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search description or user…"
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 pl-8 pr-3 py-1.5 text-[11px] text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">Action</span>
            <select
              value={actionGroup}
              onChange={(event) => setActionGroup(event.target.value as ActionGroup)}
              className="rounded-2xl border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
            >
              <option value="all">All</option>
              <option value="user">User</option>
              <option value="data">Data</option>
              <option value="settings">Settings</option>
              <option value="org">Organization</option>
              <option value="ai">AI</option>
              <option value="alert">Alerts</option>
              <option value="security">Security</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">User</span>
            <select
              value={selectedUser}
              onChange={(event) => setSelectedUser(event.target.value)}
              className="rounded-2xl border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
            >
              <option value="all">All</option>
              {uniqueUsers.map((email) => (
                <option key={email} value={email}>
                  {email}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="rounded-2xl border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">To</span>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="rounded-2xl border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 text-xs">
        {isLoading ? (
          <div className="px-6 py-8 text-center text-slate-500">Loading audit events…</div>
        ) : filteredEvents.length === 0 ? (
          <div className="px-6 py-8 text-center text-slate-500">
            No audit events yet. As your team operates in Aether, a detailed activity trail will
            appear here.
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            <div className="grid grid-cols-[180px_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,2fr)_140px] gap-3 px-6 py-3 text-[11px] text-slate-500">
              <div>Timestamp</div>
              <div>User</div>
              <div>Action</div>
              <div>Description</div>
              <div>IP address</div>
            </div>
            {filteredEvents.map((event) => {
              const kind = classifyAction(event.action);
              const isExpanded = expandedId === event.id;
              const initials =
                event.actor_email
                  ?.split('@')[0]
                  ?.split(/[.\s_-]/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((segment) => segment[0]?.toUpperCase() ?? '')
                  .join('') ?? 'SY';
              const actorLabel = event.actor_email ?? 'System';

              return (
                <div
                  key={event.id}
                  className="border-t border-zinc-800 bg-zinc-950 hover:bg-zinc-900"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : event.id)}
                    className="grid w-full grid-cols-[180px_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,2fr)_140px] gap-3 px-6 py-3 text-left text-[11px] text-slate-200"
                  >
                    <div className="text-slate-400">{formatTimestamp(event.created_at)}</div>
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-medium text-slate-200">
                        {initials}
                      </div>
                      <div className="truncate text-slate-200">{actorLabel}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${actionBadgeClasses(
                          kind,
                        )}`}
                      >
                        {event.action}
                      </span>
                    </div>
                    <div className="truncate text-slate-200">{event.description}</div>
                    <div className="text-slate-500">{event.ip_address ?? '—'}</div>
                  </button>
                  {isExpanded && event.metadata && (
                    <div className="px-6 pb-4">
                      <div className="mt-2 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-[11px] text-slate-300">
                        <div className="mb-1 text-slate-500">Metadata</div>
                        <pre className="whitespace-pre-wrap break-words">
                          {JSON.stringify(event.metadata, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!isLoading && filteredEvents.length > 0 && (
        <div className="flex items-center justify-center">
          <button
            type="button"
            disabled={!hasMore}
            onClick={() => setPage((previous) => previous + 1)}
            className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-[11px] font-medium text-slate-200 hover:bg-zinc-900 disabled:opacity-50"
          >
            {hasMore ? 'Load more' : 'No more events'}
          </button>
        </div>
      )}
    </div>
  );
}

