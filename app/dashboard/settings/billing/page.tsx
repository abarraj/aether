// Billing settings page: plan summary, real usage meters, plan comparison.
// All usage data fetched server-side via /api/billing/usage.
'use client';

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { useUser } from '@/hooks/use-user';
import { PLANS } from '@/lib/billing/plans';
import type { Plan, PlanLimits } from '@/types/domain';

// ── Types ─────────────────────────────────────────────────────────────

interface UsageData {
  plan: Plan;
  limits: PlanLimits;
  usage: {
    dataSources: number;
    users: number;
    storageMb: number;
    aiCreditsUsed: number;
    rowsIngestedThisMonth: number;
    activeStreams: number;
  };
}

// ── Progress bar component ────────────────────────────────────────────

function UsageMeter({
  label,
  used,
  limit,
  unit,
}: {
  label: string;
  used: number;
  limit: number | null;
  unit?: string;
}) {
  const isUnlimited = limit === null;
  const pct = isUnlimited
    ? 0
    : limit === 0
      ? 100
      : Math.min(100, Math.round((used / limit) * 100));
  const isWarning = !isUnlimited && pct >= 80;
  const isDanger = !isUnlimited && pct >= 95;

  const barColor = isDanger
    ? 'bg-red-500'
    : isWarning
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  const formatValue = (v: number): string => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return v.toLocaleString();
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-medium text-slate-200">
          {formatValue(used)}
          {unit ? ` ${unit}` : ''} /{' '}
          {isUnlimited
            ? '\u221E'
            : `${formatValue(limit)}${unit ? ` ${unit}` : ''}`}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: isUnlimited ? '0%' : `${pct}%` }}
        />
      </div>
      {!isUnlimited && (
        <div className="mt-1 text-right text-[10px] text-slate-500">
          {pct}% used
        </div>
      )}
    </div>
  );
}

// ── Billing month helper ──────────────────────────────────────────────

function getBillingMonth(): string {
  const now = new Date();
  return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ── Page ──────────────────────────────────────────────────────────────

export default function BillingSettingsPage() {
  const { org } = useUser();
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUsage = async () => {
      try {
        const res = await fetch('/api/billing/usage');
        if (res.ok) {
          const json = (await res.json()) as UsageData;
          setData(json);
        }
      } catch {
        toast.error('Failed to load billing data');
      } finally {
        setLoading(false);
      }
    };

    if (org) {
      void loadUsage();
    }
  }, [org]);

  // Handle checkout success/cancel query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      toast.success('Welcome to your new plan!');
      window.history.replaceState({}, '', '/dashboard/settings/billing');
    }
    if (params.get('canceled') === 'true') {
      toast.info('Checkout canceled \u2014 no changes made.');
      window.history.replaceState({}, '', '/dashboard/settings/billing');
    }
  }, []);

  const planKey: Plan = data?.plan ?? 'starter';
  const currentPlan = PLANS[planKey];
  const limits = data?.limits ?? currentPlan.limits;
  const usage = data?.usage;

  const formatLimit = (value: number | null): string =>
    value === null ? 'Unlimited' : value.toLocaleString();

  const handleUpgrade = async (plan: string) => {
    if (plan === 'enterprise') {
      window.location.href =
        'mailto:hello@718solutions.com?subject=Aether Enterprise';
      return;
    }
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (json.url) {
        window.location.href = json.url;
      } else {
        toast.error(json.error ?? 'Unable to start checkout');
      }
    } catch {
      toast.error('Something went wrong. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Billing Header ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-8 py-6 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tighter">
              Billing &amp; plan
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Manage your Aether plan, usage, and upcoming upgrades.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-emerald-400">
              {currentPlan.name} &bull; {currentPlan.price}
            </div>
          </div>
        </div>
        <div className="mt-3 text-xs text-slate-500">
          Billing cycle: {getBillingMonth()}
        </div>
      </div>

      {/* ── Usage + Plan Comparison Grid ───────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* ── Usage Box ──────────────────────────────────────────── */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-6 py-5">
            <div className="mb-4 text-sm font-medium text-slate-200">
              Usage this month
            </div>
            <div className="space-y-3">
              <UsageMeter
                label="AI Credits"
                used={usage?.aiCreditsUsed ?? 0}
                limit={limits.aiCreditsPerMonth}
              />
              <UsageMeter
                label="Data Streams"
                used={usage?.activeStreams ?? 0}
                limit={limits.maxActiveStreams}
              />
              <UsageMeter
                label="Rows Ingested"
                used={usage?.rowsIngestedThisMonth ?? 0}
                limit={limits.maxRowsPerMonth}
              />
              <UsageMeter
                label="Storage"
                used={usage?.storageMb ?? 0}
                limit={limits.storageMb}
                unit="MB"
              />
              <UsageMeter
                label="Data Connections"
                used={usage?.dataSources ?? 0}
                limit={limits.dataSources}
              />
              <UsageMeter
                label="Team Members"
                used={usage?.users ?? 0}
                limit={limits.users}
              />
            </div>
          </div>
        </div>

        {/* ── Plan Comparison Table ──────────────────────────────── */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-6 py-5">
          <div className="mb-4 text-sm font-medium text-slate-200">
            Plan comparison
          </div>
          <div className="overflow-x-auto text-xs">
            <table className="min-w-full border-collapse text-left text-slate-200">
              <thead>
                <tr>
                  <th className="border-b border-zinc-800 px-3 py-2 text-slate-400" />
                  {(['starter', 'growth', 'enterprise'] as Plan[]).map(
                    (plan) => (
                      <th
                        key={plan}
                        className={`border-b border-zinc-800 px-3 py-2 ${
                          plan === planKey
                            ? 'text-emerald-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {PLANS[plan].name}
                        {plan === planKey && (
                          <span className="ml-1.5 text-[10px] text-emerald-500">
                            &#9679;
                          </span>
                        )}
                        <div className="text-[11px] text-slate-500">
                          {PLANS[plan].price}
                        </div>
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border-b border-zinc-800 px-3 py-2 text-slate-400">
                    AI Credits / mo
                  </td>
                  {(['starter', 'growth', 'enterprise'] as Plan[]).map(
                    (plan) => (
                      <td
                        key={plan}
                        className="border-b border-zinc-800 px-3 py-2"
                      >
                        {formatLimit(PLANS[plan].limits.aiCreditsPerMonth)}
                      </td>
                    ),
                  )}
                </tr>
                <tr>
                  <td className="border-b border-zinc-800 px-3 py-2 text-slate-400">
                    Data Streams
                  </td>
                  {(['starter', 'growth', 'enterprise'] as Plan[]).map(
                    (plan) => (
                      <td
                        key={plan}
                        className="border-b border-zinc-800 px-3 py-2"
                      >
                        {formatLimit(PLANS[plan].limits.maxActiveStreams)}
                      </td>
                    ),
                  )}
                </tr>
                <tr>
                  <td className="border-b border-zinc-800 px-3 py-2 text-slate-400">
                    Rows / mo
                  </td>
                  {(['starter', 'growth', 'enterprise'] as Plan[]).map(
                    (plan) => (
                      <td
                        key={plan}
                        className="border-b border-zinc-800 px-3 py-2"
                      >
                        {formatLimit(PLANS[plan].limits.maxRowsPerMonth)}
                      </td>
                    ),
                  )}
                </tr>
                <tr>
                  <td className="border-b border-zinc-800 px-3 py-2 text-slate-400">
                    Data connections
                  </td>
                  {(['starter', 'growth', 'enterprise'] as Plan[]).map(
                    (plan) => (
                      <td
                        key={plan}
                        className="border-b border-zinc-800 px-3 py-2"
                      >
                        {formatLimit(PLANS[plan].limits.dataSources)}
                      </td>
                    ),
                  )}
                </tr>
                <tr>
                  <td className="border-b border-zinc-800 px-3 py-2 text-slate-400">
                    Team members
                  </td>
                  {(['starter', 'growth', 'enterprise'] as Plan[]).map(
                    (plan) => (
                      <td
                        key={plan}
                        className="border-b border-zinc-800 px-3 py-2"
                      >
                        {formatLimit(PLANS[plan].limits.users)}
                      </td>
                    ),
                  )}
                </tr>
                <tr>
                  <td className="border-b border-zinc-800 px-3 py-2 text-slate-400">
                    Storage
                  </td>
                  {(['starter', 'growth', 'enterprise'] as Plan[]).map(
                    (plan) => (
                      <td
                        key={plan}
                        className="border-b border-zinc-800 px-3 py-2"
                      >
                        {PLANS[plan].limits.storageMb === null
                          ? 'Unlimited'
                          : `${PLANS[plan].limits.storageMb.toLocaleString()} MB`}
                      </td>
                    ),
                  )}
                </tr>
                <tr>
                  <td className="border-b border-zinc-800 px-3 py-2 text-slate-400">
                    AI capabilities
                  </td>
                  {(['starter', 'growth', 'enterprise'] as Plan[]).map(
                    (plan) => (
                      <td
                        key={plan}
                        className="border-b border-zinc-800 px-3 py-2"
                      >
                        {PLANS[plan].limits.aiTier === 'basic' &&
                          'Basic (daily brief + chat)'}
                        {PLANS[plan].limits.aiTier === 'full' && 'Full AI COO'}
                        {PLANS[plan].limits.aiTier === 'enterprise' &&
                          'Full AI + custom'}
                      </td>
                    ),
                  )}
                </tr>
                <tr>
                  <td className="px-3 py-2 text-slate-400">
                    Enterprise features
                  </td>
                  <td className="px-3 py-2 text-slate-500">&mdash;</td>
                  <td className="px-3 py-2 text-slate-500">&mdash;</td>
                  <td className="px-3 py-2 text-slate-200">
                    SSO + custom roles + API access, dedicated support,
                    white-glove onboarding, custom SLAs
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── Upgrade / Downgrade Buttons ─────────────────────── */}
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
