// Dashboard top bar with plan badge, notifications, and user avatar dropdown.
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, ChevronDown } from 'lucide-react';

import { useUser } from '@/hooks/use-user';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeTable } from '@/hooks/use-realtime';

interface TopbarProps {
  plan: string | null;
  userName: string;
  onSignOut: () => void;
  alertsCount?: number;
  title?: string;
}

export function Topbar({ plan, userName, onSignOut, alertsCount = 0, title }: TopbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [latestAlerts, setLatestAlerts] = useState<
    { id: string; title: string; severity: string; created_at: string }[]
  >([]);
  const { org } = useUser();
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState<number | null>(null);
  const router = useRouter();

  const planLabel = plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : 'Starter';
  const initials = userName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() ?? '')
    .join('');

  const { status: realtimeStatus, lastEventAt } = useRealtimeTable(
    'kpi_snapshots',
    org ? { column: 'org_id', value: org.id } : undefined,
  );

  useEffect(() => {
    if (lastEventAt) {
      setLastUpdatedAt(lastEventAt);
      setSecondsAgo(0);
    }
  }, [lastEventAt]);

  useEffect(() => {
    if (!lastUpdatedAt) return;
    const update = () => {
      const diffSeconds = Math.floor(
        (Date.now() - lastUpdatedAt.getTime()) / 1000,
      );
      setSecondsAgo(diffSeconds);
    };
    update();
    const id = window.setInterval(update, 10_000);
    return () => window.clearInterval(id);
  }, [lastUpdatedAt]);
  return (
    <div className="h-16 border-b border-zinc-800 bg-[#0A0A0A]/90 backdrop-blur-md flex items-center px-8 relative">
      <div className="text-sm text-slate-400 font-medium">
        {title ?? 'Aether'}
      </div>

      <div className="ml-auto flex items-center gap-4">
        {realtimeStatus === 'connected' ? (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live</span>
            {secondsAgo != null && (
              <span className="text-[11px] text-slate-600">
                · {secondsAgo === 0 ? 'just now' : `${secondsAgo}s ago`}
              </span>
            )}
          </div>
        ) : realtimeStatus === 'connecting' ? (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span>Connecting…</span>
          </div>
        ) : null}

        <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
          {planLabel} plan
        </span>

        <div className="relative">
          <button
            type="button"
            className="relative flex h-9 w-9 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950 text-slate-300 hover:bg-zinc-900"
            aria-label="Notifications"
            onClick={() => setIsAlertsOpen((open) => !open)}
          >
            <Bell className="h-4 w-4" />
            {alertsCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-semibold text-black">
                {alertsCount}
              </span>
            )}
          </button>
          {isAlertsOpen && (
            <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-zinc-800 bg-zinc-950 py-2 text-xs text-slate-200 shadow-xl">
              <div className="px-3 pb-2 text-[11px] text-slate-400">Latest alerts</div>
              {latestAlerts.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-slate-500">
                  No alerts yet. Aether will surface recommendations as data flows in.
                </div>
              ) : (
                latestAlerts.map((alert) => (
                  <button
                    key={alert.id}
                    type="button"
                    className="block w-full px-3 py-2 text-left hover:bg-zinc-900"
                    onClick={() => {
                      setIsAlertsOpen(false);
                      router.push('/dashboard/alerts');
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-slate-100">{alert.title}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {new Date(alert.created_at).toLocaleString()}
                    </div>
                  </button>
                ))
              )}
              <button
                type="button"
                className="mt-1 block w-full px-3 py-2 text-left text-[11px] text-emerald-400 hover:bg-zinc-900"
                onClick={() => {
                  setIsAlertsOpen(false);
                  router.push('/dashboard/alerts');
                }}
              >
                View all alerts
              </button>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsOpen((open) => !open)}
            className="flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-slate-200 hover:bg-zinc-900"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-700 text-[11px] font-medium">
              {initials || 'AA'}
            </div>
            <span className="max-w-[140px] truncate">{userName}</span>
            <ChevronDown className="h-3 w-3 text-slate-500" />
          </button>

          {isOpen && (
          <div className="absolute right-0 mt-2 w-44 rounded-2xl border border-zinc-800 bg-zinc-950 py-1 text-xs text-slate-200 shadow-xl z-50">
              <button
                type="button"
                className="block w-full px-3 py-2 text-left hover:bg-zinc-900"
                onClick={() => {
                  setIsOpen(false);
                  router.push('/dashboard/profile');
                }}
              >
                Profile
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left hover:bg-zinc-900"
                onClick={() => {
                  setIsOpen(false);
                  router.push('/dashboard/settings');
                }}
              >
                Settings
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-slate-400 hover:bg-zinc-900 hover:text-slate-200"
                onClick={() => {
                  setIsOpen(false);
                  onSignOut();
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

