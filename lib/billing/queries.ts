// Server-only billing queries that depend on Supabase and Next.js primitives.

import { createClient } from '@/lib/supabase/server';
import type { Plan } from '@/types/domain';
import { getPlanLimits } from '@/lib/billing/plans';

export async function canAddDataSource(orgId: string): Promise<boolean> {
  const supabase = await createClient();

  const { data: org } = await supabase
    .from('organizations')
    .select('plan')
    .eq('id', orgId)
    .maybeSingle<{ plan: Plan | null }>();

  const plan: Plan = org?.plan && ['starter', 'growth', 'enterprise'].includes(org.plan)
    ? (org.plan as Plan)
    : 'starter';

  const limits = getPlanLimits(plan);
  if (limits.dataSources === null) {
    return true;
  }

  const [uploadsResult, integrationsResult] = await Promise.all([
    supabase.from('uploads').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('integrations').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
  ]);

  const used = (uploadsResult.count ?? 0) + (integrationsResult.count ?? 0);
  return used < limits.dataSources;
}

export async function canAddUser(orgId: string): Promise<boolean> {
  const supabase = await createClient();

  const { data: org } = await supabase
    .from('organizations')
    .select('plan')
    .eq('id', orgId)
    .maybeSingle<{ plan: Plan | null }>();

  const plan: Plan = org?.plan && ['starter', 'growth', 'enterprise'].includes(org.plan)
    ? (org.plan as Plan)
    : 'starter';

  const limits = getPlanLimits(plan);
  if (limits.users === null) {
    return true;
  }

  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId);

  const used = count ?? 0;
  return used < limits.users;
}

