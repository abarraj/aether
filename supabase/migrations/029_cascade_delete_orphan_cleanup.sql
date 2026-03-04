-- 029_cascade_delete_orphan_cleanup.sql
-- Fix: orphaned performance_gaps (and other child records) persist after
-- uploads are deleted because foreign keys use ON DELETE SET NULL.
--
-- This migration:
-- 1. Purges orphaned performance_gaps (upload_id IS NULL).
-- 2. Dynamically drops the existing FK (whatever its name) and re-creates
--    it as ON DELETE CASCADE for performance_gaps and entities.

-- ── Step 1: Purge orphaned performance_gaps ─────────────────────────
-- These are always upload-derived — safe to delete when upload_id is NULL.
DELETE FROM public.performance_gaps WHERE upload_id IS NULL;

-- ── Step 2: Swap performance_gaps.upload_id FK to CASCADE ───────────
-- Dynamically find and drop the constraint by column, not by guessed name.
DO $$
DECLARE
  _constraint_name TEXT;
BEGIN
  SELECT con.conname INTO _constraint_name
  FROM pg_constraint con
  JOIN pg_attribute att ON att.attnum = ANY(con.conkey)
    AND att.attrelid = con.conrelid
  WHERE con.conrelid = 'public.performance_gaps'::regclass
    AND con.contype = 'f'
    AND att.attname = 'upload_id'
  LIMIT 1;

  IF _constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.performance_gaps DROP CONSTRAINT %I',
      _constraint_name
    );
  END IF;
END $$;

ALTER TABLE public.performance_gaps
  ADD CONSTRAINT performance_gaps_upload_id_fkey
  FOREIGN KEY (upload_id) REFERENCES public.uploads (id) ON DELETE CASCADE;

-- ── Step 3: Swap entities.source_upload_id FK to CASCADE ────────────
DO $$
DECLARE
  _constraint_name TEXT;
BEGIN
  SELECT con.conname INTO _constraint_name
  FROM pg_constraint con
  JOIN pg_attribute att ON att.attnum = ANY(con.conkey)
    AND att.attrelid = con.conrelid
  WHERE con.conrelid = 'public.entities'::regclass
    AND con.contype = 'f'
    AND att.attname = 'source_upload_id'
  LIMIT 1;

  IF _constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.entities DROP CONSTRAINT %I',
      _constraint_name
    );
  END IF;
END $$;

ALTER TABLE public.entities
  ADD CONSTRAINT entities_source_upload_id_fkey
  FOREIGN KEY (source_upload_id) REFERENCES public.uploads (id) ON DELETE CASCADE;
