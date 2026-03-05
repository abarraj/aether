import { createClient } from '@supabase/supabase-js';

/**
 * Create a Supabase client with the service-role key.
 *
 * WARNING: This client BYPASSES Row-Level Security.
 * Only use in:
 *   - Cron jobs (no user session available)
 *   - Webhook handlers (external caller, no Supabase session)
 *   - One-off admin scripts
 *
 * NEVER use in user-request code paths (API routes, server actions)
 * unless there is a documented justification.
 *
 * @param context.caller  — identifier for the calling module (for audit logs)
 * @param context.orgId   — optional org_id being operated on (for audit logs)
 */
export function createAdminClient(context?: {
  caller: string;
  orgId?: string;
}) {
  if (context) {
    console.info(
      `[ADMIN_CLIENT] caller=${context.caller} org=${context.orgId ?? 'SYSTEM'}`,
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}
