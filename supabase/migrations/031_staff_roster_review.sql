-- Staff roster overrides: org-scoped list of known staff names.
-- Used by the role inference engine to classify User column values
-- as staff vs client self-checkout. Fed from payroll imports or
-- manual confirmation through the review UI.

CREATE TABLE IF NOT EXISTS public.staff_roster_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  normalized_name text NOT NULL,
  source text NOT NULL DEFAULT 'manual',  -- 'payroll_import' | 'manual' | 'review_confirm'
  source_upload_id uuid REFERENCES public.uploads (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Prevent duplicate names per org (normalized).
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_roster_org_normalized
  ON public.staff_roster_overrides (org_id, normalized_name);

-- Fast lookup during role inference.
CREATE INDEX IF NOT EXISTS idx_staff_roster_org
  ON public.staff_roster_overrides (org_id);

ALTER TABLE public.staff_roster_overrides ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'staff_roster_overrides'
      AND policyname = 'staff_roster_overrides_select_org'
  ) THEN
    CREATE POLICY staff_roster_overrides_select_org
      ON public.staff_roster_overrides
      FOR SELECT
      USING (org_id = public.get_user_org_id());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'staff_roster_overrides'
      AND policyname = 'staff_roster_overrides_insert_org'
  ) THEN
    CREATE POLICY staff_roster_overrides_insert_org
      ON public.staff_roster_overrides
      FOR INSERT
      WITH CHECK (org_id = public.get_user_org_id());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'staff_roster_overrides'
      AND policyname = 'staff_roster_overrides_delete_org'
  ) THEN
    CREATE POLICY staff_roster_overrides_delete_org
      ON public.staff_roster_overrides
      FOR DELETE
      USING (org_id = public.get_user_org_id());
  END IF;
END;
$$;

-- Add review payload columns to mapping_runs for Needs Review contract.
-- Stores structured questions + suggested answers when role inference
-- encounters ambiguity (unknown actors, missing Total, etc.).

ALTER TABLE public.mapping_runs
  ADD COLUMN IF NOT EXISTS review_questions jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS inference_metadata jsonb DEFAULT '{}'::jsonb;

-- review_questions schema:
-- [
--   {
--     "id": "unknown_actor_mahmoud",
--     "type": "unknown_actor",
--     "question": "Is 'Mahmoud' a staff member missing from payroll?",
--     "suggestion": "staff",
--     "confidence": 0.7,
--     "affected_rows": 42,
--     "resolved": false,
--     "resolution": null
--   }
-- ]

-- inference_metadata schema:
-- {
--   "staff_names_used": ["mahmoud", "leticia bassil"],
--   "self_checkout_count": 12,
--   "staff_processed_count": 45,
--   "unknown_actor_count": 3,
--   "system_actor_used": true,
--   "revenue_reconciliation_score": 0.98
-- }
