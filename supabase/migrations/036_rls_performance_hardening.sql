-- Migration 036: RLS Performance Hardening.
--
-- 1. Make get_user_org_id() STABLE — within a single transaction the
--    user's org_id does not change, so Postgres can cache the result
--    across all RLS policy checks in a single query.
--
-- 2. Add org-scoped indexes on the three new fact-layer tables
--    to ensure efficient RLS policy evaluation.
--
-- APPLY MANUALLY in the Supabase SQL Editor.

-- ── 1. Harden get_user_org_id() ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE              -- result is constant within a transaction
SECURITY DEFINER    -- runs as function creator, bypasses RLS on profiles
SET search_path = public
AS $$
  SELECT org_id
  FROM public.profiles
  WHERE id = auth.uid();
$$;

-- ── 2. Indexes for transaction_facts ────────────────────────────

-- Primary query pattern: WHERE org_id = X AND upload_id = Y
CREATE INDEX IF NOT EXISTS idx_transaction_facts_org_upload
  ON public.transaction_facts (org_id, upload_id);

-- Performance gaps query: WHERE org_id = X, aggregate by staff_name
CREATE INDEX IF NOT EXISTS idx_transaction_facts_org_staff
  ON public.transaction_facts (org_id, staff_name);

-- Time-series aggregation (derive date from transacted_at)
CREATE INDEX IF NOT EXISTS idx_transaction_facts_org_date
  ON public.transaction_facts (org_id, transacted_at);

-- ── 3. Indexes for staff_directory ──────────────────────────────

-- Upsert key: (org_id, name)
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_directory_org_name
  ON public.staff_directory (org_id, name);

-- Active staff lookup (used by leakage engine)
CREATE INDEX IF NOT EXISTS idx_staff_directory_org_active
  ON public.staff_directory (org_id, is_active);

-- ── 4. Indexes for schema_memory ────────────────────────────────

-- Upsert key: (org_id, source_column)
CREATE UNIQUE INDEX IF NOT EXISTS idx_schema_memory_org_column
  ON public.schema_memory (org_id, source_column);

-- ── 5. RLS policies for new tables ──────────────────────────────
-- (Only if not already created by the user in SQL editor)

-- transaction_facts RLS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'transaction_facts'
      AND policyname = 'transaction_facts_org_select'
  ) THEN
    ALTER TABLE public.transaction_facts ENABLE ROW LEVEL SECURITY;
    CREATE POLICY transaction_facts_org_select
      ON public.transaction_facts FOR SELECT
      USING (org_id = public.get_user_org_id());
    CREATE POLICY transaction_facts_org_insert
      ON public.transaction_facts FOR INSERT
      WITH CHECK (org_id = public.get_user_org_id());
    CREATE POLICY transaction_facts_org_delete
      ON public.transaction_facts FOR DELETE
      USING (org_id = public.get_user_org_id());
  END IF;
END;
$$;

-- staff_directory RLS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'staff_directory'
      AND policyname = 'staff_directory_org_select'
  ) THEN
    ALTER TABLE public.staff_directory ENABLE ROW LEVEL SECURITY;
    CREATE POLICY staff_directory_org_select
      ON public.staff_directory FOR SELECT
      USING (org_id = public.get_user_org_id());
    CREATE POLICY staff_directory_org_insert
      ON public.staff_directory FOR INSERT
      WITH CHECK (org_id = public.get_user_org_id());
    CREATE POLICY staff_directory_org_update
      ON public.staff_directory FOR UPDATE
      USING (org_id = public.get_user_org_id());
    CREATE POLICY staff_directory_org_delete
      ON public.staff_directory FOR DELETE
      USING (org_id = public.get_user_org_id());
  END IF;
END;
$$;

-- schema_memory RLS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'schema_memory'
      AND policyname = 'schema_memory_org_select'
  ) THEN
    ALTER TABLE public.schema_memory ENABLE ROW LEVEL SECURITY;
    CREATE POLICY schema_memory_org_select
      ON public.schema_memory FOR SELECT
      USING (org_id = public.get_user_org_id());
    CREATE POLICY schema_memory_org_insert
      ON public.schema_memory FOR INSERT
      WITH CHECK (org_id = public.get_user_org_id());
    CREATE POLICY schema_memory_org_update
      ON public.schema_memory FOR UPDATE
      USING (org_id = public.get_user_org_id());
  END IF;
END;
$$;
