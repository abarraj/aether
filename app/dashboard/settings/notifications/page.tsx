// Notification preferences surface: email, in-app, Slack, and quiet hours.

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { useUser } from '@/hooks/use-user';
import { createClient } from '@/lib/supabase/client';

type NotificationPreferences = {
  email_daily_digest: boolean;
  email_weekly_summary: boolean;
  email_critical_alerts: boolean;
  email_recommendations: boolean;
  email_team_activity: boolean;
  in_app_all: boolean;
  slack_critical_alerts: boolean;
  slack_daily_digest: boolean;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
};

const DEFAULT_PREFS: NotificationPreferences = {
  email_daily_digest: true,
  email_weekly_summary: true,
  email_critical_alerts: true,
  email_recommendations: false,
  email_team_activity: false,
  in_app_all: true,
  slack_critical_alerts: false,
  slack_daily_digest: false,
  quiet_hours_start: null,
  quiet_hours_end: null,
};

interface ToggleRowProps {
  title: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  warningText?: string;
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled,
  warningText,
}: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
      <div className="flex-1">
        <div className="text-sm font-medium text-slate-200">{title}</div>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
        {warningText && checked === false && (
          <p className="mt-1 text-[11px] text-amber-400">{warningText}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            onChange(!checked);
          }
        }}
        className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors ${
          checked
            ? 'border-emerald-500 bg-emerald-500/20'
            : 'border-zinc-700 bg-zinc-900'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

export default function NotificationsSettingsPage() {
  const { profile, org } = useUser();
  const supabase = createClient();

  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [initialPrefs, setInitialPrefs] = useState<NotificationPreferences | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const timezone = useMemo(
    () => org?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    [org?.timezone],
  );

  useEffect(() => {
    const load = async () => {
      if (!profile) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('notification_preferences')
        .eq('id', profile.id)
        .maybeSingle<{ notification_preferences: NotificationPreferences | null }>();

      if (error) {
        setPrefs(DEFAULT_PREFS);
        setInitialPrefs(DEFAULT_PREFS);
        setIsLoading(false);
        return;
      }

      const merged: NotificationPreferences = {
        ...DEFAULT_PREFS,
        ...(data?.notification_preferences ?? {}),
      };

      setPrefs(merged);
      setInitialPrefs(merged);
      setIsLoading(false);
    };

    void load();
  }, [profile, supabase]);

  const handleSave = async () => {
    if (!profile || !prefs) return;

    try {
      setIsSaving(true);
      const { error } = await supabase
        .from('profiles')
        .update({
          notification_preferences: prefs,
        })
        .eq('id', profile.id);

      if (error) {
        toast.error('Unable to save notification preferences.');
        setIsSaving(false);
        return;
      }

      if (initialPrefs) {
        const changes: Record<string, { old: unknown; new: unknown }> = {};
        (Object.keys(prefs) as (keyof NotificationPreferences)[]).forEach((key) => {
          const previous = initialPrefs?.[key];
          const next = prefs[key];
          if (previous !== next) {
            changes[key as string] = { old: previous, new: next };
          }
        });

        if (Object.keys(changes).length > 0) {
          try {
            void fetch('/api/audit/log', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action: 'settings.update',
                targetType: 'notifications',
                targetId: profile.id,
                description: 'Notification preferences updated',
                metadata: { changes },
              }),
            });
          } catch {
            // Ignore audit logging failure.
          }
        }
      }

      setInitialPrefs(prefs);
      toast.success('Notification preferences saved.');
    } catch {
      toast.error('Unexpected error saving notification preferences.');
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = useMemo(() => {
    if (!prefs || !initialPrefs) return false;
    return JSON.stringify(prefs) !== JSON.stringify(initialPrefs);
  }, [prefs, initialPrefs]);

  if (isLoading || !prefs) {
    return (
      <div className="space-y-8">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-8 py-6 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
          <h1 className="text-2xl font-semibold tracking-tighter">Notifications</h1>
          <p className="mt-1 text-sm text-slate-400">
            Control how and when Aether communicates with you.
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-8 py-8 text-xs text-slate-500">
          Loading notification preferences…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-8 py-6 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
        <h1 className="text-2xl font-semibold tracking-tighter">Notifications</h1>
        <p className="mt-1 text-sm text-slate-400">
          Control how and when Aether communicates with you.
        </p>
      </div>

      {/* Email notifications */}
      <section className="space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-[2px] text-emerald-400">
          Email notifications
        </div>
        <div className="space-y-2">
          <ToggleRow
            title="Daily Digest"
            description="Receive a daily summary of your business metrics every morning."
            checked={prefs.email_daily_digest}
            onChange={(next) => setPrefs({ ...prefs, email_daily_digest: next })}
          />
          <ToggleRow
            title="Weekly Summary"
            description="Get a comprehensive weekly report every Monday."
            checked={prefs.email_weekly_summary}
            onChange={(next) => setPrefs({ ...prefs, email_weekly_summary: next })}
          />
          <ToggleRow
            title="Critical Alerts"
            description="Immediately notified when critical anomalies are detected."
            checked={prefs.email_critical_alerts}
            onChange={(next) => setPrefs({ ...prefs, email_critical_alerts: next })}
            warningText="You may miss time-sensitive operational issues."
          />
          <ToggleRow
            title="AI Recommendations"
            description="Receive AI-generated insights and optimization suggestions."
            checked={prefs.email_recommendations}
            onChange={(next) => setPrefs({ ...prefs, email_recommendations: next })}
          />
          <ToggleRow
            title="Team Activity"
            description="Get notified when team members upload data or make changes."
            checked={prefs.email_team_activity}
            onChange={(next) => setPrefs({ ...prefs, email_team_activity: next })}
          />
        </div>
      </section>

      {/* In-app notifications */}
      <section className="space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-[2px] text-emerald-400">
          In-app notifications
        </div>
        <ToggleRow
          title="All notifications"
          description="Show notifications in the bell icon and alerts page."
          checked={prefs.in_app_all}
          onChange={(next) => setPrefs({ ...prefs, in_app_all: next })}
        />
      </section>

      {/* Slack integration */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-[2px] text-emerald-400">
            Slack integration
          </div>
          <span className="text-[11px] text-slate-500">Coming soon</span>
        </div>
        <div className="space-y-2 opacity-60">
          <ToggleRow
            title="Critical alerts to Slack"
            description="Mirror critical alerts into your Slack workspace."
            checked={prefs.slack_critical_alerts}
            onChange={(next) => setPrefs({ ...prefs, slack_critical_alerts: next })}
            disabled
          />
          <ToggleRow
            title="Daily digest to Slack"
            description="Post your daily digest into a Slack channel."
            checked={prefs.slack_daily_digest}
            onChange={(next) => setPrefs({ ...prefs, slack_daily_digest: next })}
            disabled
          />
        </div>
      </section>

      {/* Quiet hours */}
      <section className="space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-[2px] text-emerald-400">
          Quiet hours
        </div>
        <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-6 py-5 text-xs text-slate-200">
          <p className="text-xs text-slate-400">
            Pause non-critical notifications during these hours. Critical alerts may still break
            through depending on your preferences.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <div className="space-y-1">
              <div className="text-[11px] text-slate-400">Start</div>
              <input
                type="time"
                value={prefs.quiet_hours_start ?? ''}
                onChange={(event) =>
                  setPrefs({
                    ...prefs,
                    quiet_hours_start: event.target.value || null,
                  })
                }
                className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-[11px] text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
              />
            </div>
            <div className="space-y-1">
              <div className="text-[11px] text-slate-400">End</div>
              <input
                type="time"
                value={prefs.quiet_hours_end ?? ''}
                onChange={(event) =>
                  setPrefs({
                    ...prefs,
                    quiet_hours_end: event.target.value || null,
                  })
                }
                className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-[11px] text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
              />
            </div>
            <div className="ml-auto text-[11px] text-slate-500">
              Timezone: <span className="text-slate-300">{timezone}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className="rounded-2xl bg-emerald-500 px-6 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-600 active:scale-[0.985] disabled:bg-zinc-700 disabled:text-slate-400"
        >
          {isSaving ? 'Saving…' : 'Save preferences'}
        </button>
      </div>
    </div>
  );
}

