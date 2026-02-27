// General organization settings for Aether.
'use client';

import React, { useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { toast } from 'sonner';

import { useUser } from '@/hooks/use-user';
import { createClient } from '@/lib/supabase/client';

const orgSettingsSchema = z.object({
  name: z.string().min(1, 'Organization name is required.'),
  industry: z.string().optional(),
  timezone: z.string().min(1, 'Timezone is required.'),
  currency: z.string().min(1, 'Currency is required.'),
});

type OrgSettingsValues = z.infer<typeof orgSettingsSchema>;

export default function SettingsPage() {
  const { org } = useUser();
  const supabase = createClient();

  const [values, setValues] = useState<OrgSettingsValues>({
    name: '',
    industry: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    currency: 'USD',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!org) return;
    setValues({
      name: org.name,
      industry: org.industry ?? '',
      timezone: org.timezone,
      currency: org.currency,
    });
  }, [org]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!org) return;

    const parsed = orgSettingsSchema.safeParse(values);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Please fix the highlighted fields.';
      toast.error(message);
      return;
    }

    try {
      setIsSaving(true);
      const { error } = await supabase
        .from('organizations')
        .update({
          name: parsed.data.name,
          industry: parsed.data.industry,
          timezone: parsed.data.timezone,
          currency: parsed.data.currency,
        })
        .eq('id', org.id);

      if (error) {
        toast.error('Unable to save settings.');
        return;
      }

      const changes: Record<string, { old: unknown; new: unknown }> = {};
      if (parsed.data.name !== org.name) {
        changes.name = { old: org.name, new: parsed.data.name };
      }
      if (parsed.data.industry !== org.industry) {
        changes.industry = { old: org.industry, new: parsed.data.industry };
      }
      if (parsed.data.timezone !== org.timezone) {
        changes.timezone = { old: org.timezone, new: parsed.data.timezone };
      }
      if (parsed.data.currency !== org.currency) {
        changes.currency = { old: org.currency, new: parsed.data.currency };
      }

      if (Object.keys(changes).length > 0) {
        try {
          void fetch('/api/audit/log', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'settings.update',
              targetType: 'organization',
              targetId: org.id,
              description: `Organization settings updated for ${parsed.data.name}`,
              metadata: {
                changes,
              },
            }),
          });
        } catch {
          // Ignore audit logging failures.
        }
      }

      toast.success('Settings saved.');
    } catch {
      toast.error('Unexpected error saving settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteOrg = async () => {
    if (!org) return;
    const confirmed = window.confirm(
      'This will delete your organization and all associated data. This cannot be undone. Continue?',
    );
    if (!confirmed) return;

    try {
      setIsDeleting(true);
      const { error } = await supabase.from('organizations').delete().eq('id', org.id);
      if (error) {
        toast.error('Unable to delete organization.');
        setIsDeleting(false);
        return;
      }
      toast.success('Organization deleted.');
      window.location.href = '/';
    } catch {
      toast.error('Unexpected error deleting organization.');
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-8 py-6 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
        <h1 className="text-2xl font-semibold tracking-tighter">Organization settings</h1>
        <p className="mt-1 text-sm text-slate-400">
          Keep your workspace details aligned with how you actually operate.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-zinc-800 bg-zinc-950 px-8 py-6 shadow-[0_0_0_1px_rgba(24,24,27,0.9)] space-y-6"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="org-name" className="block text-sm font-medium text-slate-300">
              Organization name
            </label>
            <input
              id="org-name"
              type="text"
              value={values.name}
              onChange={(event) => setValues((previous) => ({ ...previous, name: event.target.value }))}
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:border-emerald-500/70"
              placeholder="North Shore Fitness Group"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="industry" className="block text-sm font-medium text-slate-300">
              Industry
            </label>
            <input
              id="industry"
              type="text"
              value={values.industry ?? ''}
              onChange={(event) =>
                setValues((previous) => ({ ...previous, industry: event.target.value }))
              }
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:border-emerald-500/70"
              placeholder="Fitness & Wellness"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="timezone" className="block text-sm font-medium text-slate-300">
              Timezone
            </label>
            <input
              id="timezone"
              type="text"
              value={values.timezone}
              onChange={(event) =>
                setValues((previous) => ({ ...previous, timezone: event.target.value }))
              }
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:border-emerald-500/70"
              placeholder="America/New_York"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="currency" className="block text-sm font-medium text-slate-300">
              Currency
            </label>
            <input
              id="currency"
              type="text"
              value={values.currency}
              onChange={(event) =>
                setValues((previous) => ({ ...previous, currency: event.target.value.toUpperCase() }))
              }
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:border-emerald-500/70"
              placeholder="USD"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-2xl bg-emerald-500 px-6 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-600 active:scale-[0.985] disabled:bg-zinc-700"
          >
            {isSaving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-8 py-6 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
        <div className="mb-3">
          <h2 className="text-sm font-semibold tracking-tight text-red-400">Danger zone</h2>
          <p className="mt-1 text-xs text-slate-500">
            Deleting your organization will permanently remove all data, including connected data and metrics,
            and alerts.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDeleteOrg}
          disabled={isDeleting}
          className="rounded-2xl border border-red-500/60 bg-transparent px-5 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-60"
        >
          {isDeleting ? 'Deleting…' : 'Delete organization'}
        </button>
      </div>
    </div>
  );
}

