-- Multi-tenant isolation hardening: fill RLS policy gaps.
--
-- Adds missing DELETE policies to core tables, adds the missing UPDATE
-- policy for connected_sheets, creates the industry_benchmarks table
-- with proper RLS, and protects the waitlist table.

-- ============================================================
-- 1. DELETE policies for core tables (currently deny-all by default)
-- ============================================================

CREATE POLICY uploads_delete_org ON public.uploads
  FOR DELETE USING (org_id = public.get_user_org_id());

CREATE POLICY data_rows_delete_org ON public.data_rows
  FOR DELETE USING (org_id = public.get_user_org_id());

CREATE POLICY kpi_snapshots_delete_org ON public.kpi_snapshots
  FOR DELETE USING (org_id = public.get_user_org_id());

CREATE POLICY alerts_delete_org ON public.alerts
  FOR DELETE USING (org_id = public.get_user_org_id());

CREATE POLICY ai_conversations_delete_org ON public.ai_conversations
  FOR DELETE USING (org_id = public.get_user_org_id());

CREATE POLICY ai_messages_delete_org ON public.ai_messages
  FOR DELETE USING (org_id = public.get_user_org_id());

-- ============================================================
-- 2. Missing UPDATE policy for connected_sheets
-- ============================================================

CREATE POLICY connected_sheets_org_update ON public.connected_sheets
  FOR UPDATE
  USING (org_id = public.get_user_org_id())
  WITH CHECK (org_id = public.get_user_org_id());

-- ============================================================
-- 3. industry_benchmarks table (referenced in code, never created)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.industry_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  industry text NOT NULL,
  period text NOT NULL,
  date date NOT NULL,
  sample_size int NOT NULL DEFAULT 0,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (industry, period, date)
);

-- Benchmarks contain anonymized aggregate data (no org_id column).
-- Authenticated users can read; only service role (cron) can write.
ALTER TABLE public.industry_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY industry_benchmarks_select_authenticated
  ON public.industry_benchmarks
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- No INSERT/UPDATE/DELETE policies → deny by default for anon key.
-- The cron job uses the service-role client which bypasses RLS.

-- ============================================================
-- 4. Protect waitlist table
-- ============================================================

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Allow unauthenticated inserts (public signup form).
CREATE POLICY waitlist_insert_public ON public.waitlist
  FOR INSERT WITH CHECK (true);

-- No SELECT/UPDATE/DELETE policies → deny by default for anon key.
-- Only the service-role client can read or manage waitlist entries.
