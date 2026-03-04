// Canonical helper to derive org context from the authenticated session.
// ALL server routes and actions MUST use this instead of inline profile lookups.
// org_id is NEVER accepted from the client — it is always derived here.

import type { SupabaseClient } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';

export type OrgRole = 'owner' | 'admin' | 'member';

export interface OrgContext {
  userId: string;
  orgId: string;
  role: OrgRole;
  /** The authenticated Supabase client — reuse for subsequent queries. */
  supabase: SupabaseClient;
}

/**
 * Derive org context from the authenticated Supabase session.
 *
 * Returns `null` when:
 * - No valid session exists (user not logged in)
 * - The user has no profile or no org_id assigned
 *
 * This is the ONLY sanctioned way to obtain org_id on the server.
 * The returned `supabase` client is the same authenticated instance
 * used for the auth check — reuse it for all subsequent queries.
 */
export async function getOrgContext(): Promise<OrgContext | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role')
    .eq('id', user.id)
    .maybeSingle<{ org_id: string | null; role: string }>();

  if (!profile?.org_id) return null;

  return {
    userId: user.id,
    orgId: profile.org_id,
    role: (profile.role ?? 'member') as OrgRole,
    supabase,
  };
}
