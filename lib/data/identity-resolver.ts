/**
 * Identity Resolver — deterministic actor classification.
 *
 * Given a row's User and Client values + the org's staff set,
 * returns the canonical actor type, name, and reason.
 *
 * GROUND TRUTH:
 * - User in staffSet → staff (in-studio sale)
 * - User == Client AND User NOT in staffSet → online (self-checkout)
 * - otherwise → unknown (needs review)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizePersonName } from '@/lib/ai/ontology-role-inference';

// ── Staff Set builder ──────────────────────────────────────────────────

/**
 * Build the canonical staff set for an org by unioning all three sources:
 *  1. staff_roster_overrides (payroll imports + review confirmations)
 *  2. company_people + company_person_aliases (Company Directory)
 *  3. staff_directory (fact layer)
 *
 * Returns a Set<string> of normalizePersonName'd names for O(1) lookup.
 */
export async function getStaffSet(
  orgId: string,
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const names = new Set<string>();

  // Source 1: staff_roster_overrides
  const { data: rosterRows } = await supabase
    .from('staff_roster_overrides')
    .select('normalized_name')
    .eq('org_id', orgId);

  for (const r of (rosterRows ?? []) as { normalized_name: string }[]) {
    if (r.normalized_name) names.add(r.normalized_name);
  }

  // Source 2: company_people (active) + aliases
  const { data: people } = await supabase
    .from('company_people')
    .select('canonical_name')
    .eq('org_id', orgId)
    .eq('status', 'active');

  for (const p of (people ?? []) as { canonical_name: string }[]) {
    if (p.canonical_name) names.add(p.canonical_name);
  }

  const { data: aliases } = await supabase
    .from('company_person_aliases')
    .select('canonical_alias, company_people!inner(status)')
    .eq('org_id', orgId);

  for (const a of (aliases ?? []) as unknown as { canonical_alias: string; company_people: { status: string } }[]) {
    if (a.canonical_alias && a.company_people?.status === 'active') {
      names.add(a.canonical_alias);
    }
  }

  // Source 3: staff_directory (active)
  const { data: staffDir } = await supabase
    .from('staff_directory')
    .select('name')
    .eq('org_id', orgId)
    .eq('is_active', true);

  for (const s of (staffDir ?? []) as { name: string }[]) {
    if (s.name) {
      // staff_directory stores display names; normalize for matching
      names.add(normalizePersonName(s.name));
    }
  }

  return names;
}

// ── Identity Resolution ────────────────────────────────────────────────

export interface ActorResolutionResult {
  actorType: 'staff' | 'online' | 'unknown';
  canonicalName: string;
  reason: string;
}

/**
 * Deterministic identity resolution for a single row.
 *
 * @param userRaw - Raw User column value (who processed the sale)
 * @param clientRaw - Raw Client column value (who paid)
 * @param staffSet - Set of normalized staff names (from getStaffSet)
 */
export function resolveActor({
  userRaw,
  clientRaw,
  staffSet,
}: {
  userRaw: string | null;
  clientRaw: string | null;
  staffSet: Set<string>;
}): ActorResolutionResult {
  const user = (userRaw ?? '').trim();
  const client = (clientRaw ?? '').trim();

  if (!user) {
    return {
      actorType: 'unknown',
      canonicalName: '',
      reason: 'User column is empty',
    };
  }

  const normalizedUser = normalizePersonName(user);
  const normalizedClient = client ? normalizePersonName(client) : '';

  // Rule 1: User is a known staff member → staff
  if (staffSet.has(normalizedUser)) {
    return {
      actorType: 'staff',
      canonicalName: normalizedUser,
      reason: `"${user}" found in staff roster`,
    };
  }

  // Rule 2: User == Client AND not staff → online self-checkout
  if (normalizedUser === normalizedClient && normalizedUser !== '') {
    return {
      actorType: 'online',
      canonicalName: normalizedUser,
      reason: `User == Client ("${user}"), not in staff roster → online self-checkout`,
    };
  }

  // Rule 3: Unknown
  return {
    actorType: 'unknown',
    canonicalName: normalizedUser,
    reason: `"${user}" not in staff roster and User ≠ Client`,
  };
}
