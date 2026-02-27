import { formatISO, startOfMonth, subDays } from 'date-fns';

interface OrgMetrics {
  org_id: string;
  industry: string;
  total_revenue: number;
  total_staff_cost: number;
  avg_utilization: number;
  days_of_data: number;
}

interface BenchmarkMetrics {
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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (index - lower) * (sorted[upper] - sorted[lower]);
}

/**
 * Compute industry benchmarks for the current month.
 * Only includes industries with >= 5 organizations (anonymity threshold).
 * Called by a cron job (api/cron/benchmarks).
 */
export async function computeIndustryBenchmarks(): Promise<{
  industriesProcessed: number;
  benchmarksWritten: number;
}> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const { createClient: createServiceClient } = await import('@supabase/supabase-js');
  const supabase = createServiceClient(supabaseUrl, serviceKey);

  const now = new Date();
  const monthStart = formatISO(startOfMonth(now), { representation: 'date' });
  const thirtyDaysAgo = formatISO(subDays(now, 30), { representation: 'date' });
  const today = formatISO(now, { representation: 'date' });

  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, industry')
    .not('industry', 'is', null);

  if (!orgs || orgs.length === 0) {
    return { industriesProcessed: 0, benchmarksWritten: 0 };
  }

  const { data: snapshots } = await supabase
    .from('kpi_snapshots')
    .select('org_id, date, metrics')
    .eq('period', 'daily')
    .gte('date', thirtyDaysAgo)
    .lte('date', today);

  if (!snapshots || snapshots.length === 0) {
    return { industriesProcessed: 0, benchmarksWritten: 0 };
  }

  const orgMap = new Map<string, OrgMetrics>();
  const orgIndustry = new Map<string, string>();

  for (const o of orgs as { id: string; industry: string | null }[]) {
    if (o.industry) orgIndustry.set(o.id, o.industry);
  }

  for (const snap of snapshots as {
    org_id: string;
    date: string;
    metrics: Record<string, number | null>;
  }[]) {
    const industry = orgIndustry.get(snap.org_id);
    if (!industry) continue;

    const existing =
      orgMap.get(snap.org_id) ??
      {
        org_id: snap.org_id,
        industry,
        total_revenue: 0,
        total_staff_cost: 0,
        avg_utilization: 0,
        days_of_data: 0,
      };

    const m = snap.metrics;
    existing.total_revenue += m.revenue ?? 0;
    existing.total_staff_cost += m.laborCost ?? 0;
    existing.avg_utilization += m.utilization ?? 0;
    existing.days_of_data += 1;
    orgMap.set(snap.org_id, existing);
  }

  for (const [, om] of orgMap) {
    if (om.days_of_data > 0) {
      om.avg_utilization = om.avg_utilization / om.days_of_data;
    }
  }

  const industryGroups = new Map<string, OrgMetrics[]>();
  for (const [, om] of orgMap) {
    const group = industryGroups.get(om.industry) ?? [];
    group.push(om);
    industryGroups.set(om.industry, group);
  }

  const MIN_SAMPLE = 5;
  let industriesProcessed = 0;
  let benchmarksWritten = 0;

  for (const [industry, members] of industryGroups) {
    if (members.length < MIN_SAMPLE) continue;
    industriesProcessed++;

    const revenues = members.map((m) => m.total_revenue);
    const staffCostPcts = members
      .filter((m) => m.total_revenue > 0)
      .map((m) => (m.total_staff_cost / m.total_revenue) * 100);
    const dailyRevenues = members
      .filter((m) => m.days_of_data > 0)
      .map((m) => m.total_revenue / m.days_of_data);
    const capacities = members.map((m) => m.avg_utilization);

    const metrics: BenchmarkMetrics = {
      sample_size: members.length,
      median_monthly_revenue: median(revenues),
      p25_monthly_revenue: percentile(revenues, 25),
      p75_monthly_revenue: percentile(revenues, 75),
      median_staff_cost_pct: median(staffCostPcts),
      p25_staff_cost_pct: percentile(staffCostPcts, 25),
      p75_staff_cost_pct: percentile(staffCostPcts, 75),
      median_daily_revenue: median(dailyRevenues),
      median_capacity: median(capacities),
    };

    const { error } = await supabase
      .from('industry_benchmarks')
      .upsert(
        {
          industry,
          period: 'monthly',
          date: monthStart,
          sample_size: members.length,
          metrics,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'industry,period,date' },
      );

    if (!error) benchmarksWritten++;
  }

  return { industriesProcessed, benchmarksWritten };
}

