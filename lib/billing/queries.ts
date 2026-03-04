// Server-only billing queries that depend on Supabase and Next.js primitives.
// All queries are org-scoped and use the authenticated Supabase client.

import { createClient } from '@/lib/supabase/server';
import type { Plan, PlanLimits } from '@/types/domain';
import { getPlanLimits } from '@/lib/billing/plans';

// ── Helpers ─────────────────────────────────────────────────────────

/** Resolve the org's plan, defaulting to 'starter' if missing/invalid. */
async function resolveOrgPlan(orgId: string): Promise<{ plan: Plan; limits: PlanLimits }> {
  const supabase = await createClient();

  const { data: org } = await supabase
    .from('organizations')
    .select('plan')
    .eq('id', orgId)
    .maybeSingle<{ plan: Plan | null }>();

  const plan: Plan =
    org?.plan && ['starter', 'growth', 'enterprise'].includes(org.plan)
      ? (org.plan as Plan)
      : 'starter';

  return { plan, limits: getPlanLimits(plan) };
}

/** Start of the current calendar month (UTC). */
function monthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

// ── Existing limit checks ───────────────────────────────────────────

export async function canAddDataSource(orgId: string): Promise<boolean> {
  const { limits } = await resolveOrgPlan(orgId);
  if (limits.dataSources === null) return true;

  const supabase = await createClient();
  const [uploadsResult, integrationsResult] = await Promise.all([
    supabase.from('uploads').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('integrations').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
  ]);

  const used = (uploadsResult.count ?? 0) + (integrationsResult.count ?? 0);
  return used < limits.dataSources;
}

export async function canAddUser(orgId: string): Promise<boolean> {
  const { limits } = await resolveOrgPlan(orgId);
  if (limits.users === null) return true;

  const supabase = await createClient();
  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId);

  return (count ?? 0) < limits.users;
}

// ── AI credit metering ──────────────────────────────────────────────

/** Count successful AI requests in the current billing cycle. */
export async function getAiCreditsUsedThisMonth(orgId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('ai_usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('success', true)
    .gte('created_at', monthStart());

  return count ?? 0;
}

/** Returns true if the org can make another AI request. */
export async function assertAiCreditsAvailable(orgId: string): Promise<boolean> {
  const { limits } = await resolveOrgPlan(orgId);
  if (limits.aiCreditsPerMonth === null) return true;

  const used = await getAiCreditsUsedThisMonth(orgId);
  return used < limits.aiCreditsPerMonth;
}

// ── Storage metering ────────────────────────────────────────────────

/** Total storage used by all uploads in the org, in MB. */
export async function getOrgStorageMb(orgId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('uploads')
    .select('file_size')
    .eq('org_id', orgId);

  const totalBytes = (data ?? []).reduce(
    (sum: number, row: { file_size?: number | null }) => sum + (row?.file_size ?? 0),
    0,
  );

  return Math.round(totalBytes / (1024 * 1024));
}

/** Returns true if adding `additionalMb` stays within the plan limit. */
export async function canUploadStorage(orgId: string, additionalMb: number): Promise<boolean> {
  const { limits } = await resolveOrgPlan(orgId);
  if (limits.storageMb === null) return true;

  const currentMb = await getOrgStorageMb(orgId);
  return currentMb + additionalMb <= limits.storageMb;
}

// ── Rows-per-month metering ─────────────────────────────────────────

/** Total rows ingested this calendar month. */
export async function getRowsIngestedThisMonth(orgId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('uploads')
    .select('row_count')
    .eq('org_id', orgId)
    .gte('created_at', monthStart());

  return (data ?? []).reduce(
    (sum: number, row: { row_count?: number | null }) => sum + (row?.row_count ?? 0),
    0,
  );
}

/** Returns true if adding `additionalRows` stays within the plan limit. */
export async function canIngestRows(orgId: string, additionalRows: number): Promise<boolean> {
  const { limits } = await resolveOrgPlan(orgId);
  if (limits.maxRowsPerMonth === null) return true;

  const current = await getRowsIngestedThisMonth(orgId);
  return current + additionalRows <= limits.maxRowsPerMonth;
}

// ── Active streams metering ─────────────────────────────────────────

/** Count of currently active data streams. */
export async function getActiveStreamCount(orgId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('data_streams')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('status', 'active');

  return count ?? 0;
}

/** Returns true if a new stream can be created. */
export async function canAddStream(orgId: string): Promise<boolean> {
  const { limits } = await resolveOrgPlan(orgId);
  if (limits.maxActiveStreams === null) return true;

  const current = await getActiveStreamCount(orgId);
  return current < limits.maxActiveStreams;
}

// ── Composite usage summary (for billing page) ─────────────────────

export interface UsageSummary {
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

/**
 * Single server-side call that returns all usage metrics for the billing page.
 * Runs 6 queries in parallel for performance.
 */
export async function getUsageSummary(orgId: string): Promise<UsageSummary> {
  const { plan, limits } = await resolveOrgPlan(orgId);
  const supabase = await createClient();

  const [
    uploadsResult,
    integrationsResult,
    usersResult,
    storageResult,
    aiCreditsResult,
    rowsResult,
    streamsResult,
  ] = await Promise.all([
    supabase.from('uploads').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('integrations').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('uploads').select('file_size').eq('org_id', orgId),
    supabase
      .from('ai_usage_events')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('success', true)
      .gte('created_at', monthStart()),
    supabase
      .from('uploads')
      .select('row_count')
      .eq('org_id', orgId)
      .gte('created_at', monthStart()),
    supabase
      .from('data_streams')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'active'),
  ]);

  const storageBytes = (storageResult.data ?? []).reduce(
    (sum: number, row: { file_size?: number | null }) => sum + (row?.file_size ?? 0),
    0,
  );

  const rowsIngested = (rowsResult.data ?? []).reduce(
    (sum: number, row: { row_count?: number | null }) => sum + (row?.row_count ?? 0),
    0,
  );

  return {
    plan,
    limits,
    usage: {
      dataSources: (uploadsResult.count ?? 0) + (integrationsResult.count ?? 0),
      users: usersResult.count ?? 0,
      storageMb: Math.round(storageBytes / (1024 * 1024)),
      aiCreditsUsed: aiCreditsResult.count ?? 0,
      rowsIngestedThisMonth: rowsIngested,
      activeStreams: streamsResult.count ?? 0,
    },
  };
}
