-- 029_cascade_delete_orphan_cleanup.sql
-- Fix: orphaned performance_gaps (and other child records) persist after
-- uploads are deleted because foreign keys use ON DELETE SET NULL.
--
-- 1. Purge all orphaned performance_gaps where upload_id IS NULL.
-- 2. Change performance_gaps.upload_id FK to ON DELETE CASCADE.
-- 3. Repeat for entities.source_upload_id.

-- ── Step 1: Purge existing orphaned rows ────────────────────────────
DELETE FROM public.performance_gaps WHERE upload_id IS NULL;
DELETE FROM public.entities          WHERE source_upload_id IS NULL;

-- ── Step 2: Alter performance_gaps FK to CASCADE ────────────────────
ALTER TABLE public.performance_gaps
  DROP CONSTRAINT IF EXISTS performance_gaps_upload_id_fkey;

ALTER TABLE public.performance_gaps
  ADD CONSTRAINT performance_gaps_upload_id_fkey
  FOREIGN KEY (upload_id) REFERENCES public.uploads (id) ON DELETE CASCADE;

-- ── Step 3: Alter entities FK to CASCADE ────────────────────────────
ALTER TABLE public.entities
  DROP CONSTRAINT IF EXISTS entities_source_upload_id_fkey;

ALTER TABLE public.entities
  ADD CONSTRAINT entities_source_upload_id_fkey
  FOREIGN KEY (source_upload_id) REFERENCES public.uploads (id) ON DELETE CASCADE;
