'use client';

import { useEffect, useState } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/client';

export type RealtimeStatus = 'connecting' | 'connected' | 'offline';

export interface RealtimeFilter {
  column: string;
  value: string;
}

/**
 * Generic Supabase Realtime subscription hook for a single table.
 * Subscribes to INSERT/UPDATE/DELETE events and calls the provided callback.
 */
export function useRealtimeTable<T>(
  table: string,
  filter?: RealtimeFilter,
  onChange?: (payload: RealtimePostgresChangesPayload<T>) => void,
): { status: RealtimeStatus; lastEventAt: Date | null } {
  const supabase = createClient();
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!table) return;

    const channel = supabase
      .channel(
        `realtime:${table}:${filter?.column ?? 'all'}:${filter?.value ?? 'all'}`,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: filter ? `${filter.column}=eq.${filter.value}` : undefined,
        },
        (payload) => {
          setLastEventAt(new Date());
          onChange?.(payload as RealtimePostgresChangesPayload<T>);
        },
      )
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus === 'SUBSCRIBED') {
          setStatus('connected');
        } else if (
          subscriptionStatus === 'CHANNEL_ERROR' ||
          subscriptionStatus === 'TIMED_OUT' ||
          subscriptionStatus === 'CLOSED'
        ) {
          setStatus('offline');
        } else {
          setStatus('connecting');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, filter?.column, filter?.value, onChange]);

  return { status, lastEventAt };
}

