'use client';

import { useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

export interface IndustryBenchmark {
  sample_size: number;
  median_monthly_revenue: number;
  p25_monthly_revenue: number;
  p75_monthly_revenue: number;
  median_staff_cost_pct: number;
  p25_staff_cost_pct: number;
  p75_staff_cost_pct: number;
  median_daily_revenue: number;
  median_capacity: number;
}

export function useBenchmarks(industry: string | null): {
  benchmark: IndustryBenchmark | null;
  isLoading: boolean;
  industry: string | null;
} {
  const [benchmark, setBenchmark] = useState<IndustryBenchmark | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!industry) return;

    const fetchBenchmarks = async () => {
      setIsLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from('industry_benchmarks')
        .select('metrics')
        .eq('industry', industry)
        .eq('period', 'monthly')
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.metrics) {
        setBenchmark(data.metrics as unknown as IndustryBenchmark);
      }
      setIsLoading(false);
    };

    void fetchBenchmarks();
  }, [industry]);

  return { benchmark, isLoading, industry: industry ?? null };
}

