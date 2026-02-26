// Recommendation banner that surfaces the latest unread AI alert.
'use client';

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { useUser } from '@/hooks/use-user';
import { createClient } from '@/lib/supabase/client';

type RecommendationAlert = {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string | null;
  created_at: string;
};

export function RecommendationBanner() {
  const router = useRouter();
  const { org } = useUser();
  const [alert, setAlert] = useState<RecommendationAlert | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchLatest = async () => {
      if (!org) {
        setIsLoading(false);
        return;
      }

      const supabase = createClient();
      const { data, error } = await supabase
        .from('alerts')
        .select('id, type, severity, title, description, created_at')
        .eq('org_id', org.id)
        .eq('type', 'expansion_opportunity')
        .or('type.eq.labor_optimization,type.eq.schedule_optimization,type.eq.revenue_trend')
        .eq('is_read', false)
        .eq('is_dismissed', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .returns<RecommendationAlert[]>();

      if (!error && data && data.length > 0) {
        setAlert(data[0]);
      }
      setIsLoading(false);
    };

    void fetchLatest();
  }, [org]);

  const handleDismiss = async () => {
    if (!alert || !org) return;
    const supabase = createClient();
    await supabase
      .from('alerts')
      .update({ is_read: true, is_dismissed: true })
      .eq('id', alert.id)
      .eq('org_id', org.id);
    setAlert(null);
  };

  const handleTellMeMore = () => {
    if (!alert) return;
    const url = new URL(window.location.href);
    url.pathname = '/dashboard/ai-assistant';
    url.searchParams.set('alert', alert.id);
    window.location.href = url.toString();
  };

  if (isLoading || !alert) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 rounded-3xl border border-zinc-800 bg-zinc-950 px-8 py-6">
      <div className="text-xs uppercase tracking-[2px] text-emerald-400">Today&apos;s recommendation</div>
      <div className="text-sm text-slate-300">
        {alert.description ?? alert.title}
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs">
        <button
          type="button"
          onClick={handleTellMeMore}
          className="rounded-2xl bg-emerald-500 px-4 py-1.5 font-medium text-slate-950 hover:bg-emerald-600 active:scale-[0.985]"
        >
          Tell me more
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="text-slate-400 underline-offset-4 hover:text-slate-200 hover:underline"
        >
          Dismiss
        </button>
        <div className="ml-auto flex items-center gap-1 text-[11px] text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin text-emerald-400/60" />
          Live data
        </div>
      </div>
    </div>
  );
}

