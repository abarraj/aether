'use client';

import { useState, useRef, type FormEvent } from 'react';
import {
  Database,
  LineChart,
  Brain,
  BarChart3,
  Bell,
  Sparkles,
  ArrowRight,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';

import { PLANS } from '@/lib/billing/plans';
import { APP_URL } from '@/lib/constants/domains';
import type { Plan } from '@/types/domain';

// ── Constants ───────────────────────────────────────────────────────
const SECTIONS = [
  { id: 'hero', label: 'Top' },
  { id: 'problem', label: 'Problem' },
  { id: 'how', label: 'How' },
  { id: 'modules', label: 'Modules' },
  { id: 'pricing', label: 'Pricing' },
] as const;

const HOW_STEPS = [
  {
    icon: Database,
    title: 'Connect',
    body: 'Bring in exports from POS, membership, payroll, and inventory systems. No engineering team required.',
  },
  {
    icon: LineChart,
    title: 'Analyze',
    body: 'Normalize revenue, labor, and utilization into a single model. See what\u2019s working and what\u2019s drifting\u2014per location, per concept.',
  },
  {
    icon: Brain,
    title: 'Decide',
    body: 'Ask your AI COO for playbooks\u2014pricing, staffing, expansion\u2014and get reasoning-backed recommendations, not dashboards.',
  },
] as const;

const MODULES = [
  {
    icon: BarChart3,
    title: 'Real-time Dashboard',
    body: 'Daily brief of revenue, labor, and utilization across every location in one calm view.',
    visual: 'chart',
  },
  {
    icon: Brain,
    title: 'AI Business Advisor',
    body: 'Ask questions in plain English and get scenario-tested answers grounded in your data.',
    visual: 'chat',
  },
  {
    icon: Bell,
    title: 'Smart Alerts',
    body: 'Automatic detection of problems and opportunities\u2014before they show up in your bottom line.',
    visual: 'alerts',
  },
] as const;

const PLAN_FEATURES: Record<Plan, string[]> = {
  starter: [
    'Up to 3 data sources',
    '2 team members',
    'AI daily brief + dashboards',
    'Email support',
  ],
  growth: [
    'Unlimited data sources',
    'Up to 25 team members',
    'Full AI COO with scenario planning',
    'Priority support',
  ],
  enterprise: [
    'Unlimited everything',
    'SSO + custom roles + API access',
    'White-glove onboarding',
    'Custom SLAs',
  ],
};

// ── Page ─────────────────────────────────────────────────────────────
export default function AetherLanding() {
  const [heroEmail, setHeroEmail] = useState('');
  const [ctaEmail, setCtaEmail] = useState('');
  const [isSubmittingHero, setIsSubmittingHero] = useState(false);
  const [isSubmittingCta, setIsSubmittingCta] = useState(false);

  // Refs for connector line viewport tracking
  const howSectionRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async (
    event: FormEvent,
    source: string,
    emailValue: string,
    setEmailValue: (v: string) => void,
    setLoading: (v: boolean) => void,
  ) => {
    event.preventDefault();
    if (!emailValue || !emailValue.includes('@')) {
      toast.error('Please enter a valid work email.');
      return;
    }
    try {
      setLoading(true);
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailValue, source }),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast.error(result?.error ?? 'Unable to join the waitlist right now.');
        return;
      }
      toast.success("You\u2019re on the list. We\u2019ll be in touch.");
      setEmailValue('');
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-slate-200 selection:bg-emerald-500/30">
      {/* ── Navigation ─────────────────────────────────────────── */}
      <nav className="fixed z-50 w-full border-b border-zinc-800/60 bg-[#050505]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-4">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-lg bg-emerald-500" />
            <span className="text-xl font-semibold tracking-tighter">
              Aether
            </span>
          </div>
          <div className="hidden items-center gap-8 text-[13px] text-slate-400 sm:flex">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="transition-colors hover:text-white"
              >
                {s.label}
              </a>
            ))}
          </div>
          <a
            href={`${APP_URL}/login`}
            className="rounded-xl border border-zinc-700/60 px-5 py-2 text-[13px] font-medium transition-colors hover:border-zinc-500 hover:text-white"
          >
            Sign in
          </a>
        </div>
      </nav>

      {/* ── 1. Hero ────────────────────────────────────────────── */}
      <section
        id="hero"
        className="relative flex min-h-screen items-center overflow-hidden pt-20"
      >
        {/* Background glow */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[800px] rounded-full bg-emerald-500/[0.04] blur-[120px]" />
        </div>

        <div className="relative mx-auto flex max-w-6xl flex-col gap-16 px-8 md:flex-row md:items-center">
          {/* Left — Copy */}
          <div className="max-w-xl space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800/60 bg-zinc-900/50 px-4 py-1.5">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              <span className="text-[11px] font-medium uppercase tracking-[2px] text-emerald-400">
                Private beta &middot; Limited seats
              </span>
            </div>

            <h1 className="text-5xl font-bold leading-[0.92] tracking-[-0.04em] md:text-6xl lg:text-7xl">
              Your AI Chief
              <br />
              Operating Officer
            </h1>

            <p className="max-w-md text-[15px] leading-relaxed text-slate-400">
              Aether connects every operational data source&mdash;revenue,
              labor, utilization&mdash;and turns it into a single, always-on
              brain for your business.
            </p>

            <form
              className="mt-2 flex flex-col gap-3 sm:flex-row"
              onSubmit={(e) =>
                handleSubmit(
                  e,
                  'landing_hero',
                  heroEmail,
                  setHeroEmail,
                  setIsSubmittingHero,
                )
              }
            >
              <input
                type="email"
                value={heroEmail}
                onChange={(e) => setHeroEmail(e.target.value)}
                placeholder="you@multiunitbrand.com"
                className="w-full rounded-xl border border-zinc-800/60 bg-zinc-950/60 px-5 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              <button
                type="submit"
                disabled={isSubmittingHero}
                className="group flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-emerald-500 px-7 py-3 text-sm font-medium text-slate-950 transition-all hover:bg-emerald-400 active:scale-[0.985] disabled:bg-zinc-700"
              >
                {isSubmittingHero ? (
                  'Joining\u2026'
                ) : (
                  <>
                    Request early access
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

            <p className="text-xs text-slate-600">
              No spam. No credit card. We onboard a small number of operators
              each month.
            </p>
          </div>

          {/* Right — Mockup card */}
          <div className="relative w-full max-w-xl">
            <div className="rounded-2xl border border-zinc-800/50 bg-zinc-950/60 p-6 shadow-2xl backdrop-blur-sm">
              <div className="mb-4 flex items-center justify-between text-xs text-slate-500">
                <span>Executive overview</span>
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  Live
                </span>
              </div>
              <div className="space-y-3 text-xs">
                <div className="flex items-baseline justify-between rounded-xl border border-zinc-800/40 bg-zinc-950/80 px-4 py-3">
                  <div>
                    <div className="text-slate-500">
                      Total revenue (last 7 days)
                    </div>
                    <div className="mt-1 text-xl font-semibold tracking-tight text-slate-100">
                      $184,920
                    </div>
                  </div>
                  <div className="text-emerald-400">+12.4%</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-zinc-800/40 bg-zinc-950/80 px-4 py-3">
                    <div className="text-slate-500">Staff costs</div>
                    <div className="mt-1 text-lg font-semibold tracking-tight">
                      $52,340
                    </div>
                    <div className="text-[11px] text-emerald-400">
                      28.7% of revenue
                    </div>
                  </div>
                  <div className="rounded-xl border border-zinc-800/40 bg-zinc-950/80 px-4 py-3">
                    <div className="text-slate-500">Capacity</div>
                    <div className="mt-1 text-lg font-semibold tracking-tight">
                      84%
                    </div>
                    <div className="text-[11px] text-slate-600">
                      Peak capacity: 94%
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-zinc-800/40 bg-zinc-950/80 px-4 py-3 text-xs leading-relaxed text-slate-400">
                <span className="text-emerald-400">&ldquo;</span>
                If you add one extra 7pm slot on Thursday and rebalance staff on
                Monday, you&apos;ll unlock an estimated{' '}
                <span className="text-emerald-400">+$18,400</span> this month.
                <span className="text-emerald-400">&rdquo;</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. The Problem ─────────────────────────────────────── */}
      <section
        id="problem"
        className="relative border-t border-zinc-800/40 py-32"
      >
        <div className="mx-auto max-w-5xl px-8">
          <p className="text-[11px] font-medium uppercase tracking-[3px] text-emerald-400/80">
            The problem
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight tracking-tighter md:text-4xl">
            Your data is everywhere.
            <br />
            <span className="text-slate-500">Your answers are nowhere.</span>
          </h2>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              {
                title: 'Fragmented data',
                body: 'Revenue in one tool, labor in another, bookings in a third. You\u2019re flying blind across locations.',
              },
              {
                title: 'Reactive decisions',
                body: 'By the time you see the problem in a spreadsheet, you\u2019ve already lost the week. No early warnings, no playbooks.',
              },
              {
                title: 'No single source of truth',
                body: 'Every manager has a different number. There\u2019s no system that normalizes, explains, and recommends.',
              },
            ].map((card, i) => (
              <div
                key={card.title}
                className="group rounded-2xl border border-zinc-800/40 bg-zinc-950/40 px-6 py-6 transition-colors hover:border-zinc-700/60"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800/60 text-sm font-semibold text-slate-500">
                  {i + 1}
                </div>
                <h3 className="text-sm font-semibold tracking-tight">
                  {card.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
                  {card.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. How It Works ────────────────────────────────────── */}
      <section
        id="how"
        ref={howSectionRef}
        className="relative border-t border-zinc-800/40 py-32"
      >
        <div className="mx-auto max-w-5xl px-8">
          <p className="text-[11px] font-medium uppercase tracking-[3px] text-emerald-400/80">
            How Aether works
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tighter md:text-4xl">
            Connect. Analyze. Decide.
          </h2>
          <p className="mt-3 max-w-2xl text-[14px] text-slate-500">
            Aether plugs into your existing stack&mdash;POS, booking,
            payroll&mdash;and turns raw data exhaust into decisions you can act
            on today.
          </p>

          <div className="relative mt-16">
            {/* Vertical connector line */}
            <div className="absolute left-[19px] top-0 hidden h-full w-px bg-gradient-to-b from-emerald-500/40 via-emerald-500/20 to-transparent md:block" />

            <div className="space-y-12">
              {HOW_STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div key={step.title} className="relative flex gap-6">
                    {/* Step marker */}
                    <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800/60 bg-zinc-950">
                      <Icon className="h-4 w-4 text-emerald-400" />
                    </div>

                    <div className="pt-1">
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] font-medium uppercase tracking-[2px] text-emerald-400/60">
                          Step {i + 1}
                        </span>
                      </div>
                      <h3 className="mt-1 text-lg font-semibold tracking-tight">
                        {step.title}
                      </h3>
                      <p className="mt-1.5 max-w-lg text-[13px] leading-relaxed text-slate-500">
                        {step.body}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. Modules ─────────────────────────────────────────── */}
      <section
        id="modules"
        className="relative border-t border-zinc-800/40 py-32"
      >
        <div className="mx-auto max-w-6xl px-8">
          <p className="text-[11px] font-medium uppercase tracking-[3px] text-emerald-400/80">
            Modules
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tighter md:text-4xl">
            Modules built for operators
          </h2>
          <p className="mt-3 max-w-2xl text-[14px] text-slate-500">
            Each module is opinionated and battle-tested with real operators.
          </p>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {MODULES.map((mod) => {
              const Icon = mod.icon;
              return (
                <div
                  key={mod.title}
                  className="group rounded-2xl border border-zinc-800/40 bg-zinc-950/40 p-6 transition-colors hover:border-zinc-700/60"
                >
                  <div className="mb-3 flex items-center gap-2 text-xs text-emerald-400">
                    <Icon className="h-4 w-4" />
                    <span className="font-medium">{mod.title}</span>
                  </div>
                  <p className="text-[13px] leading-relaxed text-slate-400">
                    {mod.body}
                  </p>

                  {/* Mini-visualisations */}
                  {mod.visual === 'chart' && (
                    <div className="mt-5 flex h-28 items-end gap-1 rounded-xl border border-zinc-800/30 bg-zinc-950/60 p-4">
                      {[40, 65, 45, 80, 55, 70, 90, 60, 75, 85, 50, 95].map(
                        (h, i) => (
                          <div
                            key={`bar-${i}`}
                            className="flex flex-1 flex-col justify-end rounded-sm bg-emerald-500/10"
                            style={{ height: `${h}%` }}
                          >
                            <div
                              className="w-full rounded-sm bg-emerald-500/40"
                              style={{ height: '60%' }}
                            />
                          </div>
                        ),
                      )}
                    </div>
                  )}
                  {mod.visual === 'chat' && (
                    <div className="mt-5 flex h-28 flex-col justify-end gap-2 rounded-xl border border-zinc-800/30 bg-zinc-950/60 p-4">
                      <div className="flex items-center gap-2">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20">
                          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        </div>
                        <div className="h-2 w-3/4 rounded-full bg-zinc-800/60" />
                      </div>
                      <div className="ml-7 space-y-1.5">
                        <div className="h-2 w-full rounded-full bg-zinc-800/40" />
                        <div className="h-2 w-5/6 rounded-full bg-zinc-800/40" />
                        <div className="h-2 w-2/3 rounded-full bg-zinc-800/40" />
                      </div>
                    </div>
                  )}
                  {mod.visual === 'alerts' && (
                    <div className="mt-5 space-y-2 rounded-xl border border-zinc-800/30 bg-zinc-950/60 p-4">
                      {(
                        [
                          ['critical', 'bg-rose-400'],
                          ['warning', 'bg-amber-400'],
                          ['info', 'bg-emerald-400'],
                        ] as const
                      ).map(([sev, color]) => (
                        <div
                          key={sev}
                          className="flex items-center gap-2 rounded-lg bg-zinc-900/40 px-3 py-2"
                        >
                          <div className={`h-1.5 w-1.5 rounded-full ${color}`} />
                          <div className="h-2 flex-1 rounded-full bg-zinc-800/40" />
                          <div className="h-2 w-10 rounded-full bg-zinc-800/30" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 5. Pricing ─────────────────────────────────────────── */}
      <section
        id="pricing"
        className="relative border-t border-zinc-800/40 py-32"
      >
        <div className="mx-auto max-w-6xl px-8">
          <div className="mb-14 space-y-2 text-center">
            <p className="text-[11px] font-medium uppercase tracking-[3px] text-emerald-400/80">
              Pricing
            </p>
            <h2 className="text-3xl font-semibold tracking-tighter md:text-4xl">
              Start small. Scale to empire.
            </h2>
            <p className="text-[14px] text-slate-500">
              Simple, transparent pricing. We&apos;re in private
              beta&mdash;no cards, just a curated waitlist.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {(['starter', 'growth', 'enterprise'] as Plan[]).map((plan) => {
              const isPopular = plan === 'growth';
              return (
                <div
                  key={plan}
                  className={`flex flex-col rounded-2xl border px-6 py-6 text-sm transition-colors ${
                    isPopular
                      ? 'border-emerald-500/20 bg-gradient-to-b from-emerald-500/[0.03] to-zinc-950/60 shadow-[0_0_40px_rgba(16,185,129,0.04)]'
                      : 'border-zinc-800/40 bg-zinc-950/40'
                  }`}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <div className="text-[11px] font-medium uppercase tracking-[2px] text-slate-500">
                        {PLANS[plan].name}
                      </div>
                      <div className="mt-1 text-xl font-semibold tracking-tight">
                        {PLANS[plan].price}
                      </div>
                    </div>
                    {isPopular && (
                      <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-400">
                        Most popular
                      </div>
                    )}
                  </div>
                  <ul className="mt-1 flex-1 space-y-2.5 text-[13px] text-slate-500">
                    {PLAN_FEATURES[plan].map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500/60" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className={`mt-6 w-full rounded-xl px-4 py-2.5 text-[13px] font-medium transition-all ${
                      isPopular
                        ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                        : 'border border-zinc-800/60 bg-zinc-950/60 text-slate-300 hover:border-zinc-700/60'
                    }`}
                    onClick={(e) =>
                      handleSubmit(
                        e as unknown as FormEvent,
                        'pricing',
                        heroEmail,
                        setHeroEmail,
                        setIsSubmittingHero,
                      )
                    }
                  >
                    Request access
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Social proof strip ─────────────────────────────────── */}
      <section className="border-t border-zinc-800/40">
        <div className="mx-auto flex max-w-5xl items-center justify-center gap-3 px-8 py-8 text-xs text-slate-600">
          <Sparkles className="h-3.5 w-3.5 text-emerald-400/60" />
          <span>
            Trusted by operators managing{' '}
            <span className="text-slate-400">
              $200M+ in combined annual revenue
            </span>
            .
          </span>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────── */}
      <section className="border-t border-zinc-800/40 py-24">
        <div className="mx-auto max-w-3xl px-8 text-center">
          <h2 className="text-2xl font-semibold tracking-tighter md:text-3xl">
            Ready for an AI COO that actually understands your business?
          </h2>
          <p className="mt-3 text-[14px] text-slate-500">
            Join the private beta. We&apos;ll reach out when there&apos;s a
            fit with your locations, stack, and scale.
          </p>

          <form
            className="mx-auto mt-6 flex max-w-md flex-col gap-3 sm:flex-row"
            onSubmit={(e) =>
              handleSubmit(
                e,
                'landing_cta',
                ctaEmail,
                setCtaEmail,
                setIsSubmittingCta,
              )
            }
          >
            <input
              type="email"
              value={ctaEmail}
              onChange={(e) => setCtaEmail(e.target.value)}
              placeholder="you@multiunitbrand.com"
              className="w-full rounded-xl border border-zinc-800/60 bg-zinc-950/60 px-5 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            <button
              type="submit"
              disabled={isSubmittingCta}
              className="flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-emerald-500 px-7 py-3 text-sm font-medium text-slate-950 transition-all hover:bg-emerald-400 active:scale-[0.985] disabled:bg-zinc-700"
            >
              {isSubmittingCta ? 'Joining\u2026' : 'Request early access'}
            </button>
          </form>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-800/40">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-8 py-6 text-xs text-slate-600 md:flex-row">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded-md bg-emerald-500" />
            <span className="text-sm font-semibold tracking-tight text-slate-300">
              Aether
            </span>
            <span>&copy; 718 Solutions</span>
          </div>
          <div className="flex items-center gap-6">
            <a
              href={`${APP_URL}/login`}
              className="transition-colors hover:text-slate-300"
            >
              Sign in
            </a>
            <a href="#pricing" className="transition-colors hover:text-slate-300">
              Pricing
            </a>
            <a
              href="#features"
              className="transition-colors hover:text-slate-300"
            >
              Product
            </a>
            <span className="text-zinc-800">&middot;</span>
            <span>Privacy</span>
            <span className="text-zinc-800">&middot;</span>
            <span>Terms</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
