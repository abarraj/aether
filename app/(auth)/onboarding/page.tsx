// Multi-step onboarding wizard for creating an organization and defaults.
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { UploadCloud, Check } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { StepIndicator } from '@/components/shared/step-indicator';
import { createClient } from '@/lib/supabase/client';

type Step = 1 | 2 | 3;

type IndustryOption =
  | 'Fitness & Wellness'
  | 'Restaurant & Food'
  | 'Retail'
  | 'Logistics'
  | 'Healthcare'
  | 'Professional Services'
  | 'Other';

type CurrencyCode = 'USD' | 'EUR' | 'LBP' | 'AED' | 'SAR';

interface CurrencyOption {
  code: CurrencyCode;
  label: string;
}

type UploadChoice = 'upload' | 'skip' | null;

const industries: IndustryOption[] = [
  'Fitness & Wellness',
  'Restaurant & Food',
  'Retail',
  'Logistics',
  'Healthcare',
  'Professional Services',
  'Other',
];

const currencies: CurrencyOption[] = [
  { code: 'USD', label: 'US Dollar' },
  { code: 'EUR', label: 'Euro' },
  { code: 'LBP', label: 'Lebanese Pound' },
  { code: 'AED', label: 'UAE Dirham' },
  { code: 'SAR', label: 'Saudi Riyal' },
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function OnboardingPage(): JSX.Element {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<Step>(1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Step 1
  const [orgName, setOrgName] = useState<string>('');
  const [industry, setIndustry] = useState<IndustryOption | ''>('');
  const [slug, setSlug] = useState<string>('');

  // Step 2
  const [timezone, setTimezone] = useState<string>('');
  const [currency, setCurrency] = useState<CurrencyCode | ''>('');
  const [currencySearch, setCurrencySearch] = useState<string>('');

  // Step 3
  const [uploadChoice, setUploadChoice] = useState<UploadChoice>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!orgName) {
      setSlug('');
      return;
    }
    setSlug(slugify(orgName));
  }, [orgName]);

  useEffect(() => {
    try {
      const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detectedTimezone) {
        setTimezone(detectedTimezone);
      }
    } catch {
      // Swallow detection errors and keep timezone empty.
    }
  }, []);

  const filteredCurrencies = currencies.filter((currencyOption) => {
    if (!currencySearch.trim()) {
      return true;
    }

    const term = currencySearch.toLowerCase();
    return (
      currencyOption.code.toLowerCase().includes(term) ||
      currencyOption.label.toLowerCase().includes(term)
    );
  });

  const goNext = () => {
    if (step === 1) {
      if (!orgName.trim()) {
        toast.error('Please enter your business name.');
        return;
      }
      if (!industry) {
        toast.error('Please select an industry.');
        return;
      }
    }

    if (step === 2) {
      if (!timezone) {
        toast.error('Please choose a timezone.');
        return;
      }
      if (!currency) {
        toast.error('Please choose a currency.');
        return;
      }
    }

    setStep((current) => Math.min((current + 1) as Step, 3));
  };

  const goBack = () => {
    if (step === 1) {
      return;
    }
    setStep((current) => Math.max((current - 1) as Step, 1));
  };

  const handleFileCardClick = () => {
    setUploadChoice('upload');
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleSkipCardClick = () => {
    setUploadChoice('skip');
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setSelectedFileName(null);
      setUploadProgress(0);
      setIsUploading(false);
      return;
    }

    setSelectedFileName(file.name);
    setIsUploading(true);
    setUploadProgress(10);

    // Simulated upload progress for now; storage wiring can be added later.
    const increments: number[] = [40, 70, 100];
    let index = 0;

    const advance = () => {
      setUploadProgress(increments[index]);
      index += 1;
      if (index < increments.length) {
        window.setTimeout(advance, 250);
      } else {
        setIsUploading(false);
        toast.success('Upload ready. We will process your data shortly.');
      }
    };

    window.setTimeout(advance, 250);
  };

  const handleComplete = async () => {
    if (!orgName.trim() || !industry || !timezone || !currency) {
      toast.error('Please complete the previous steps before continuing.');
      return;
    }

    try {
      setIsSubmitting(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        toast.error('You must be signed in to complete onboarding.');
        setIsSubmitting(false);
        return;
      }

      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: orgName.trim(),
          slug,
          industry,
          timezone,
          currency,
          onboarding_completed: true,
        })
        .select('id')
        .single();

      if (orgError || !org) {
        toast.error('Unable to create your organization. Please try again.');
        setIsSubmitting(false);
        return;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ org_id: org.id })
        .eq('id', user.id);

      if (profileError) {
        toast.error('Organization created but assigning it to your profile failed.');
        setIsSubmitting(false);
        return;
      }

      toast.success('Workspace ready. Redirecting to your dashboard.');
      router.push('/dashboard');
    } catch {
      toast.error('Something went wrong completing onboarding.');
      setIsSubmitting(false);
    }
  };

  const renderStepLabel = () => {
    if (step === 1) return 'Name your business';
    if (step === 2) return 'Set your defaults';
    return 'Connect your first data';
  };

  return (
    <div className="bg-[#0A0A0A] text-slate-200">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-950/80 px-8 py-9 shadow-[0_0_0_1px_rgba(24,24,27,0.9)] transition-transform duration-200 ease-out hover:scale-[1.005]">
        <div className="flex flex-col items-center gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-emerald-500" />
            <span className="text-xl font-semibold tracking-tight">Aether</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <StepIndicator currentStep={step} totalSteps={3} />
            <p className="text-xs text-slate-500">{`Step ${step} of 3`}</p>
          </div>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tighter mb-1">{renderStepLabel()}</h1>
          <p className="text-sm text-slate-400">
            Let&apos;s set up your workspace so Aether can operate like your AI COO from day one.
          </p>
        </div>

        <div className="relative min-h-[220px]">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step-1"
                initial={{ x: 40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -40, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="space-y-5"
              >
                <div className="space-y-2">
                  <label
                    htmlFor="org-name"
                    className="block text-sm font-medium text-slate-300"
                  >
                    Business name
                  </label>
                  <input
                    id="org-name"
                    type="text"
                    value={orgName}
                    onChange={(event) => setOrgName(event.target.value)}
                    className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:border-emerald-500/70"
                    placeholder="e.g. North Shore Fitness Group"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="industry"
                    className="block text-sm font-medium text-slate-300"
                  >
                    Industry
                  </label>
                  <select
                    id="industry"
                    value={industry}
                    onChange={(event) =>
                      setIndustry(event.target.value as IndustryOption | '')
                    }
                    className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:border-emerald-500/70"
                  >
                    <option value="">Select an industry</option>
                    {industries.map((industryOption) => (
                      <option key={industryOption} value={industryOption}>
                        {industryOption}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-400">Workspace slug</p>
                  <div className="flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs text-slate-400">
                    <span>app.aether.co/</span>
                    <span className="text-slate-200">{slug || 'your-workspace'}</span>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step-2"
                initial={{ x: 40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -40, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="space-y-5"
              >
                <div className="space-y-2">
                  <label
                    htmlFor="timezone"
                    className="block text-sm font-medium text-slate-300"
                  >
                    Default timezone
                  </label>
                  <input
                    id="timezone"
                    type="text"
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                    className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:border-emerald-500/70"
                    placeholder="e.g. America/New_York"
                  />
                  <p className="text-xs text-slate-500">
                    We detect your browser timezone but you can override it for your operations.
                  </p>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="currency-search"
                    className="block text-sm font-medium text-slate-300"
                  >
                    Default currency
                  </label>
                  <input
                    id="currency-search"
                    type="text"
                    value={currencySearch}
                    onChange={(event) => setCurrencySearch(event.target.value)}
                    className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:border-emerald-500/60"
                    placeholder="Search currency (e.g. USD, Euro)"
                  />

                  <div className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950/80 p-1.5 text-xs">
                    {filteredCurrencies.map((currencyOption) => {
                      const isActive = currency === currencyOption.code;
                      return (
                        <button
                          key={currencyOption.code}
                          type="button"
                          onClick={() => setCurrency(currencyOption.code)}
                          className={[
                            'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition-colors',
                            isActive
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/40'
                              : 'text-slate-300 hover:bg-zinc-900',
                          ].join(' ')}
                        >
                          <span className="font-medium">{currencyOption.code}</span>
                          <span className="text-[11px] text-slate-400">
                            {currencyOption.label}
                          </span>
                        </button>
                      );
                    })}
                    {filteredCurrencies.length === 0 && (
                      <div className="px-3 py-2 text-slate-500">
                        No currencies match your search.
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step-3"
                initial={{ x: 40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -40, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="space-y-5"
              >
                <p className="text-sm text-slate-400">
                  You can connect POS exports, membership data, or financials. Start with a CSV
                  export now or skip and we&apos;ll remind you later.
                </p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleFileCardClick}
                    className={[
                      'flex flex-col items-start gap-2 rounded-2xl border px-4 py-3 text-left transition-all',
                      uploadChoice === 'upload'
                        ? 'border-emerald-500/70 bg-emerald-500/5'
                        : 'border-zinc-800 bg-zinc-950 hover:bg-zinc-900',
                    ].join(' ')}
                  >
                    <div className="flex items-center gap-2">
                      <UploadCloud className="h-4 w-4 text-emerald-400" />
                      <span className="text-sm font-medium text-slate-100">
                        Upload a CSV
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Bring revenue, membership, or operations data into Aether.
                    </p>

                    {selectedFileName && (
                      <div className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-[11px] text-slate-300">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{selectedFileName}</span>
                          <span className="text-slate-500">{uploadProgress}%</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-900">
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleSkipCardClick}
                    className={[
                      'flex flex-col items-start gap-2 rounded-2xl border px-4 py-3 text-left transition-all',
                      uploadChoice === 'skip'
                        ? 'border-zinc-700 bg-zinc-950'
                        : 'border-zinc-800 bg-zinc-950 hover:bg-zinc-900',
                    ].join(' ')}
                  >
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-slate-400" />
                      <span className="text-sm font-medium text-slate-100">
                        I&apos;ll do this later
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      You can always connect data sources from your dashboard.
                    </p>
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 1 || isSubmitting}
            className="text-xs font-medium text-slate-400 underline-offset-4 hover:text-slate-200 hover:underline disabled:cursor-default disabled:opacity-40"
          >
            Back
          </button>

          {step < 3 ? (
            <Button
              type="button"
              onClick={goNext}
              className="rounded-2xl bg-emerald-500 px-6 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-600 active:scale-[0.985] transition-all"
            >
              Continue
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleComplete}
              disabled={isSubmitting || isUploading}
              className="rounded-2xl bg-emerald-500 px-6 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-600 active:scale-[0.985] transition-all disabled:opacity-60"
            >
              {isSubmitting ? 'Finishing setup…' : 'Finish and go to dashboard'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

