'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Brain,
  Database,
  LineChart,
  Shield,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

import { PLANS } from '@/lib/billing/plans';
import type { Plan } from '@/types/domain';

export default function AetherLanding() {
  const [email, setEmail] = useState<string>('');
  const [isSubmittingHero, setIsSubmittingHero] = useState<boolean>(false);
  const [isSubmittingCta, setIsSubmittingCta] = useState<boolean>(false);

  const handleSubmit = async (event: FormEvent, source: string) => {
    event.preventDefault();
    if (!email || !email.includes('@')) {
      toast.error('Please enter a valid work email.');
      return;
    }

    try {
      if (source === 'landing_hero') {
        setIsSubmittingHero(true);
      } else {
        setIsSubmittingCta(true);
      }

      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source }),
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.error(result?.error ?? 'Unable to join the waitlist right now.');
        return;
      }

      toast.success('You’re on the list. We’ll be in touch.');
      setEmail('');
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsSubmittingHero(false);
      setIsSubmittingCta(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-slate-200">
      {/* Top Navigation */}
      <nav className="fixed z-50 w-full border-b border-zinc-800 bg-[#0A0A0A]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-5">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-xl bg-emerald-500" />
            <span className="text-2xl font-semibold tracking-tighter">Aether</span>
          </div>
          <div className="flex items-center gap-8 text-sm">
            <a href="#features" className="transition-colors hover:text-white">
              Features
            </a>
            <a href="#modules" className="transition-colors hover:text-white">
              Modules
            </a>
            <a href="#pricing" className="transition-colors hover:text-white">
              Pricing
            </a>
            <Link href="/login">
              <button className="rounded-2xl border border-zinc-700 px-6 py-2.5 text-sm transition-colors hover:border-zinc-500">
                Sign in
              </button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <main className="pt-28">
        <section className="flex min-h-[80vh] items-center">
          <div className="mx-auto flex max-w-6xl flex-col gap-14 px-8 md:flex-row md:items-center">
            <div className="max-w-xl space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-4 py-1.5">
                <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                <span className="text-xs font-medium uppercase tracking-[2px] text-emerald-400">
                  Private beta • Limited seats
                </span>
              </div>

              <h1 className="text-5xl font-semibold tracking-tighter md:text-6xl lg:text-7xl">
                Your AI Chief
                <br />
                Operating Officer
              </h1>

              <p className="max-w-md text-sm text-slate-400 md:text-base">
                Aether connects every operational data source—revenue, labor, utilization—and turns
                it into a single, always-on brain for your business.
              </p>

              <form
                className="mt-4 flex flex-col gap-3 sm:flex-row"
                onSubmit={(event) => handleSubmit(event, 'landing_hero')}
              >
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@multiunitbrand.com"
                  className="w-full rounded-3xl border border-zinc-800 bg-zinc-950 px-5 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500/60"
                />
                <button
                  type="submit"
                  disabled={isSubmittingHero}
                  className="flex items-center justify-center rounded-3xl bg-emerald-500 px-8 py-3 text-sm font-medium text-slate-950 transition-all hover:bg-emerald-600 active:scale-[0.985] disabled:bg-zinc-700"
                >
                  {isSubmittingHero ? 'Joining waitlist…' : 'Request early access'}
                </button>
              </form>

              <p className="text-xs text-slate-500">
                No spam. No credit card. We onboard a small number of operators each month.
              </p>

              <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span>Designed for multi-location &amp; franchise operators</span>
                </div>
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="relative w-full max-w-xl"
            >
              <div className="absolute -inset-12 -z-10 bg-gradient-to-tr from-emerald-500/10 via-transparent to-emerald-500/5 blur-3xl" />
              <div className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-6 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
                <div className="mb-4 flex items-center justify-between text-xs text-slate-400">
                  <span>Executive overview</span>
                  <span className="text-emerald-400">Live</span>
                </div>
                <div className="space-y-3 text-xs">
                  <div className="flex items-baseline justify-between rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
                    <div>
                      <div className="text-slate-400">Total revenue (last 7 days)</div>
                      <div className="mt-1 text-xl font-semibold tracking-tight">$184,920</div>
                    </div>
                    <div className="text-emerald-400">+12.4%</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
                      <div className="text-slate-400">Staff costs</div>
                      <div className="mt-1 text-lg font-semibold tracking-tight">$52,340</div>
                      <div className="text-[11px] text-emerald-400">28.7% of revenue</div>
                    </div>
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
                      <div className="text-slate-400">Capacity</div>
                      <div className="mt-1 text-lg font-semibold tracking-tight">84%</div>
                      <div className="text-[11px] text-slate-500">Peak capacity: 94%</div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-xs text-slate-300">
                  “If you add one extra 7pm slot on Thursday and rebalance staff on Monday, you’ll
                  unlock an estimated +$18,400 this month.”
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Social proof */}
        <section className="border-t border-zinc-800 bg-[#0A0A0A]">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-8 py-6 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-400" />
              <span>
                Trusted by early operators in{' '}
                <span className="text-slate-300">New York, London, and Dubai</span>.
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-4">
              <span className="h-px w-10 bg-zinc-800" />
              <span>Built for private equity-backed brands and high-volume operators.</span>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-zinc-800 bg-[#0A0A0A] py-16">
          <div className="mx-auto max-w-6xl px-8">
            <div className="mb-10 space-y-2">
              <p className="text-xs font-medium uppercase tracking-[2px] text-emerald-400">
                How Aether works
              </p>
              <h2 className="text-3xl font-semibold tracking-tighter">Connect. Analyze. Decide.</h2>
              <p className="max-w-2xl text-sm text-slate-400">
                Aether plugs into your existing stack—POS, booking, payroll—and turns raw data
                exhaust into decisions you can act on today.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              <div className="rounded-3xl border border-zinc-800 bg-zinc-950 px-6 py-5 shadow-[0_0_0_1px_rgba(24,24,27,0.9)] hover:border-emerald-500/30 transition-all">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10">
                  <Database className="h-4 w-4 text-emerald-400" />
                </div>
                <h3 className="text-sm font-semibold tracking-tight">Connect</h3>
                <p className="mt-2 text-xs text-slate-400">
                  Bring in exports from your POS, membership, payroll, and inventory systems. No
                  engineering team required.
                </p>
              </div>
              <div className="rounded-3xl border border-zinc-800 bg-zinc-950 px-6 py-5 shadow-[0_0_0_1px_rgba(24,24,27,0.9)] hover:border-emerald-500/30 transition-all">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10">
                  <LineChart className="h-4 w-4 text-emerald-400" />
                </div>
                <h3 className="text-sm font-semibold tracking-tight">Analyze</h3>
                <p className="mt-2 text-xs text-slate-400">
                  Normalize revenue, labor, and utilization into a single model. See what&apos;s
                  working and what&apos;s drifting—per location, per concept.
                </p>
              </div>
              <div className="rounded-3xl border border-zinc-800 bg-zinc-950 px-6 py-5 shadow-[0_0_0_1px_rgba(24,24,27,0.9)] hover:border-emerald-500/30 transition-all">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10">
                  <Brain className="h-4 w-4 text-emerald-400" />
                </div>
                <h3 className="text-sm font-semibold tracking-tight">Decide</h3>
                <p className="mt-2 text-xs text-slate-400">
                  Ask your AI COO for playbooks—pricing, staffing, expansion—and get
                  reasoning-backed recommendations, not dashboards.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Module showcase */}
        <section id="modules" className="border-t border-zinc-800 bg-[#0A0A0A] py-16">
          <div className="mx-auto max-w-6xl px-8">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tighter">Modules built for operators</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Each module is opinionated and battle-tested with real operators.
                </p>
              </div>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-2">
              {[
                {
                  title: 'Real-time Dashboard',
                  description:
                    'Daily brief of revenue, labor, and utilization across every location in one calm view.',
                },
                {
                  title: 'AI Business Advisor',
                  description:
                    'Ask questions in plain English and get scenario-tested answers grounded in your data.',
                },
                {
                  title: 'Smart Alerts',
                  description:
                    'Automatic detection of problems and opportunities — before they show up in your bottom line.',
                },
              ].map((module) => (
                <div
                  key={module.title}
                  className="min-w-[260px] flex-1 rounded-3xl border border-zinc-800 bg-zinc-950 px-6 py-5 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]"
                >
                  <div className="mb-3 flex items-center gap-2 text-xs text-emerald-400">
                    <BarChart3 className="h-4 w-4" />
                    <span>{module.title}</span>
                  </div>
                  <p className="text-xs text-slate-300">{module.description}</p>
                  <div className="mt-4 h-32 rounded-2xl border border-zinc-900 bg-gradient-to-br from-zinc-900 to-zinc-950" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="border-t border-zinc-800 bg-[#0A0A0A] py-16">
          <div className="mx-auto max-w-6xl px-8">
            <div className="mb-10 space-y-2 text-center">
              <p className="text-xs font-medium uppercase tracking-[2px] text-emerald-400">
                Pricing
              </p>
              <h2 className="text-3xl font-semibold tracking-tighter">
                Start small. Scale to empire.
              </h2>
              <p className="text-sm text-slate-400">
                Simple, transparent pricing. We&apos;re in private beta—no cards, just a curated
                waitlist.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {(['starter', 'growth', 'enterprise'] as Plan[]).map((plan) => (
                <div
                  key={plan}
                  className="flex flex-col rounded-3xl border border-zinc-800 bg-zinc-950 px-6 py-6 text-sm shadow-[0_0_0_1px_rgba(24,24,27,0.9)]"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-[2px] text-slate-400">
                        {PLANS[plan].name}
                      </div>
                      <div className="mt-1 text-xl font-semibold text-slate-100">
                        {PLANS[plan].price}
                      </div>
                    </div>
                    {plan === 'growth' && (
                      <div className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-400">
                        Most popular
                      </div>
                    )}
                  </div>
                  <ul className="mt-3 space-y-2 text-xs text-slate-400">
                    {plan === 'starter' && (
                      <>
                        <li>Up to 3 data sources</li>
                        <li>2 team members</li>
                        <li>AI daily brief + dashboards</li>
                        <li>Email support</li>
                      </>
                    )}
                    {plan === 'growth' && (
                      <>
                        <li>Unlimited data sources</li>
                        <li>Up to 25 team members</li>
                        <li>Full AI COO with scenario planning</li>
                        <li>Priority support</li>
                      </>
                    )}
                    {plan === 'enterprise' && (
                      <>
                        <li>Unlimited everything</li>
                        <li>SSO + custom roles + API access</li>
                        <li>White-glove onboarding</li>
                        <li>Custom SLAs</li>
                      </>
                    )}
                  </ul>
                  <button
                    type="button"
                    className="mt-5 w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs font-medium text-slate-200 hover:border-emerald-500/40 hover:bg-zinc-900"
                    onClick={(event) => handleSubmit(event as unknown as FormEvent, 'pricing')}
                  >
                    Request access
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-zinc-800 bg-[#0A0A0A] py-16">
          <div className="mx-auto max-w-4xl px-8">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 px-8 py-8 text-center shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
              <h2 className="text-2xl font-semibold tracking-tighter">
                Ready for an AI COO that actually understands your business?
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Join the private beta. We’ll reach out when there’s a fit with your locations,
                stack, and scale.
              </p>
              <form
                className="mt-5 flex flex-col items-center gap-3 sm:flex-row"
                onSubmit={(event) => handleSubmit(event, 'landing_cta')}
              >
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@multiunitbrand.com"
                  className="w-full rounded-3xl border border-zinc-800 bg-zinc-950 px-5 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500/60"
                />
                <button
                  type="submit"
                  disabled={isSubmittingCta}
                  className="flex w-full items-center justify-center rounded-3xl bg-emerald-500 px-8 py-3 text-sm font-medium text-slate-950 transition-all hover:bg-emerald-600 active:scale-[0.985] disabled:bg-zinc-700 sm:w-auto"
                >
                  {isSubmittingCta ? 'Joining waitlist…' : 'Request early access'}
                </button>
              </form>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 bg-[#0A0A0A]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-8 py-6 text-xs text-slate-500 md:flex-row">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-lg bg-emerald-500" />
            <span className="text-sm font-semibold tracking-tight text-slate-200">
              Aether
            </span>
            <span className="text-xs text-slate-500">© 718 Solutions</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/login" className="hover:text-slate-300">
              Sign in
            </Link>
            <a href="#pricing" className="hover:text-slate-300">
              Pricing
            </a>
            <a href="#features" className="hover:text-slate-300">
              Product
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
