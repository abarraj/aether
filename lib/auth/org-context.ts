// Canonical helper to derive org context from the authenticated session.
// ALL server routes and actions MUST use this instead of inline profile lookups.
// org_id is NEVER accepted from the client — it is always derived here.

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { type Permission, type Role, hasPermission, isValidRole } from '@/lib/auth/permissions';

/** @deprecated Use `Role` from `@/lib/auth/permissions` instead. */
export type OrgRole = Role;

export interface OrgContext {
  userId: string;
  orgId: string;
  role: Role;
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

  const role: Role = isValidRole(profile.role) ? profile.role : 'viewer';

  return {
    userId: user.id,
    orgId: profile.org_id,
    role,
    supabase,
  };
}

/**
 * Require that the current user has the given permission.
 *
 * Returns `OrgContext` on success, or a `NextResponse` 401/403 on failure.
 * Usage in API routes:
 *
 * ```ts
 * const result = await requirePermission('manage_billing');
 * if (result instanceof NextResponse) return result;
 * const ctx = result; // OrgContext
 * ```
 */
export async function requirePermission(
  permission: Permission,
): Promise<OrgContext | NextResponse> {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(ctx.role, permission)) {
    return NextResponse.json(
      { error: 'Forbidden', required: permission },
      { status: 403 },
    );
  }
  return ctx;
}
