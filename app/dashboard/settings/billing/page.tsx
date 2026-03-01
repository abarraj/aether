// Billing settings page showing current plan, limits, and usage.
'use client';

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { useUser } from '@/hooks/use-user';
import { createClient } from '@/lib/supabase/client';
import { PLANS, getPlanLimits } from '@/lib/billing/plans';
import type { Plan } from '@/types/domain';

type Usage = {
  dataSources: number;
  users: number;
  storageMb: number;
};

export default function BillingSettingsPage() {
  const { org } = useUser();
  const [usage, setUsage] = useState<Usage>({
    dataSources: 0,
    users: 0,
    storageMb: 0,
  });

  useEffect(() => {
    const loadUsage = async () => {
      if (!org) return;
      const supabase = createClient();

      const [uploadsResponse, integrationsResponse, usersResponse, storageResponse] = await Promise.all([
        supabase.from('uploads').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
        supabase.from('integrations').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
        supabase.from('uploads').select('file_size').eq('org_id', org.id),
      ]);

      const dataSourceCount = (uploadsResponse.count ?? 0) + (integrationsResponse.count ?? 0);
      const storageBytes = (storageResponse.data ?? []).reduce(
        (sum: number, row: { file_size?: number | null }) => sum + (row?.file_size ?? 0),
        0,
      );
      const storageMb = Math.round(storageBytes / (1024 * 1024));

      setUsage({
        dataSources: dataSourceCount,
        users: usersResponse.count ?? 0,
        storageMb,
      });
    };

    if (org) {
      void loadUsage();
    }
  }, [org]);

  const planKey: Plan = org?.plan && ['starter', 'growth', 'enterprise'].includes(org.plan)
    ? (org.plan as Plan)
    : 'starter';

  const currentPlan = PLANS[planKey];
  const limits = getPlanLimits(planKey);

  const formatLimit = (value: number | null): string =>
    value === null ? 'Unlimited' : value.toString();

  const handleUpgrade = async (plan: string) => {
    if (plan === 'enterprise') {
      window.location.href = 'mailto:hello@718solutions.com?subject=Aether Enterprise';
      return;
    }
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error ?? 'Unable to start checkout');
      }
    } catch {
      toast.error('Something went wrong. Please try again.');
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      toast.success('Welcome to your new plan!');
      window.history.replaceState({}, '', '/dashboard/settings/billing');
    }
    if (params.get('canceled') === 'true') {
      toast.info('Checkout canceled — no changes made.');
      window.history.replaceState({}, '', '/dashboard/settings/billing');
    }
  }, []);

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-8 py-6 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tighter">Billing &amp; plan</h1>
            <p className="mt-1 text-sm text-slate-400">
              Manage your Aether plan, usage, and upcoming upgrades.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-emerald-400">
            {currentPlan.name} • {currentPlan.price}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-6 py-5">
            <div className="mb-3 text-sm font-medium text-slate-200">
              Usage this month
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-xs">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
                <div className="text-slate-400">Data connections</div>
                <div className="mt-1 text-sm font-semibold text-slate-100">
                  {usage.dataSources} / {formatLimit(limits.dataSources)}
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
                <div className="text-slate-400">Team members</div>
                <div className="mt-1 text-sm font-semibold text-slate-100">
                  {usage.users} / {formatLimit(limits.users)}
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
                <div className="text-slate-400">Storage</div>
                <div className="mt-1 text-sm font-semibold text-slate-100">
                  {usage.storageMb} MB / {limits.storageMb === null ? 'Unlimited' : `${limits.storageMb} MB`}
                </div>
              </div>
            </div>
          </div>

        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-6 py-5">
          <div className="mb-4 text-sm font-medium text-slate-200">
            Plan comparison
          </div>
          <div className="overflow-x-auto text-xs">
            <table className="min-w-full border-collapse text-left text-slate-200">
              <thead>
                <tr>
                  <th className="border-b border-zinc-800 px-3 py-2 text-slate-400" />
                  {(['starter', 'growth', 'enterprise'] as Plan[]).map((plan) => (
                    <th
                      key={plan}
                      className="border-b border-zinc-800 px-3 py-2 text-slate-400"
                    >
                      {PLANS[plan].name}
                      <div className="text-[11px] text-slate-500">
                        {PLANS[plan].price}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border-b border-zinc-800 px-3 py-2 text-slate-400">
                    Data connections
                  </td>
                  {(['starter', 'growth', 'enterprise'] as Plan[]).map((plan) => (
                    <td key={plan} className="border-b border-zinc-800 px-3 py-2">
                      {formatLimit(PLANS[plan].limits.dataSources)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="border-b border-zinc-800 px-3 py-2 text-slate-400">
                    Team members
                  </td>
                  {(['starter', 'growth', 'enterprise'] as Plan[]).map((plan) => (
                    <td key={plan} className="border-b border-zinc-800 px-3 py-2">
                      {formatLimit(PLANS[plan].limits.users)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="border-b border-zinc-800 px-3 py-2 text-slate-400">
                    Storage
                  </td>
                  {(['starter', 'growth', 'enterprise'] as Plan[]).map((plan) => (
                    <td key={plan} className="border-b border-zinc-800 px-3 py-2">
                      {PLANS[plan].limits.storageMb === null ? 'Unlimited' : `${PLANS[plan].limits.storageMb} MB`}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="border-b border-zinc-800 px-3 py-2 text-slate-400">
                    AI capabilities
                  </td>
                  {(['starter', 'growth', 'enterprise'] as Plan[]).map((plan) => (
                    <td key={plan} className="border-b border-zinc-800 px-3 py-2">
                      {PLANS[plan].limits.aiTier === 'basic' && 'Basic (daily brief + chat)'}
                      {PLANS[plan].limits.aiTier === 'full' && 'Full AI COO'}
                      {PLANS[plan].limits.aiTier === 'enterprise' && 'Full AI + custom'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-3 py-2 text-slate-400">Enterprise features</td>
                  <td className="px-3 py-2 text-slate-500">—</td>
                  <td className="px-3 py-2 text-slate-500">—</td>
                  <td className="px-3 py-2 text-slate-200">
                    SSO + custom roles + API access, dedicated support,
                    white-glove onboarding, custom SLAs
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div>
              {planKey === 'starter' ? (
                <div className="w-full rounded-2xl border border-zinc-700 px-4 py-2.5 text-center text-sm text-slate-500">
                  Current plan
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleUpgrade('starter')}
                  className="w-full rounded-2xl border border-zinc-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-zinc-900"
                >
                  Downgrade
                </button>
              )}
            </div>
            <div>
              {planKey === 'growth' ? (
                <div className="w-full rounded-2xl border border-emerald-500/30 px-4 py-2.5 text-center text-sm text-emerald-400">
                  Current plan
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleUpgrade('growth')}
                  className="w-full rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-emerald-600"
                >
                  Upgrade to Growth
                </button>
              )}
            </div>
            <div>
              {planKey === 'enterprise' ? (
                <div className="w-full rounded-2xl border border-emerald-500/30 px-4 py-2.5 text-center text-sm text-emerald-400">
                  Current plan
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleUpgrade('enterprise')}
                  className="w-full rounded-2xl border border-zinc-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-zinc-900"
                >
                  Contact Us
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

