'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BarChart3, Sparkles, Target } from 'lucide-react';

export function FirstRunBanner() {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const wasDismissed = localStorage.getItem('aether_first_run_dismissed');
    if (!wasDismissed) setDismissed(false);
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('aether_first_run_dismissed', 'true');
  };

  if (dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] px-6 py-5"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-semibold text-emerald-400">
              Your data is live — here&apos;s what to explore
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  handleDismiss();
                  router.push('/dashboard/performance');
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-medium text-slate-200 transition hover:bg-zinc-800"
              >
                <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />
                See where you&apos;re leaking revenue
              </button>
              <button
                type="button"
                onClick={() => {
                  handleDismiss();
                  router.push('/dashboard/ai-assistant');
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-medium text-slate-200 transition hover:bg-zinc-800"
              >
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                Ask your AI COO a question
              </button>
              <button
                type="button"
                onClick={() => {
                  handleDismiss();
                  router.push('/dashboard/data-model');
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-medium text-slate-200 transition hover:bg-zinc-800"
              >
                <Target className="h-3.5 w-3.5 text-emerald-400" />
                Explore your business model
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 text-slate-600 transition hover:text-slate-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
