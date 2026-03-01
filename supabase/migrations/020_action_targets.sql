-- Action targets: recovery goals set by the operator (e.g. "close 50% of gap in 4 weeks").

CREATE TABLE IF NOT EXISTS public.action_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  dimension_field text NOT NULL,
  dimension_value text NOT NULL,
  target_type text NOT NULL DEFAULT 'reduce_gap',
  target_pct numeric NOT NULL DEFAULT 50,
  target_value numeric,
  baseline_gap numeric NOT NULL DEFAULT 0,
  deadline date,
  title text,
  notes text,
  status text NOT NULL DEFAULT 'active',
  current_gap numeric,
  current_pct_change numeric,
  last_checked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_targets_org_status
  ON public.action_targets (org_id, status);

CREATE INDEX IF NOT EXISTS idx_action_targets_org_dimension
  ON public.action_targets (org_id, dimension_field, dimension_value);

ALTER TABLE public.action_targets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'action_targets'
      AND policyname = 'action_targets_select_org'
  ) THEN
    CREATE POLICY action_targets_select_org
      ON public.action_targets
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
      AND tablename = 'action_targets'
      AND policyname = 'action_targets_insert_org'
  ) THEN
    CREATE POLICY action_targets_insert_org
      ON public.action_targets
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
      AND tablename = 'action_targets'
      AND policyname = 'action_targets_update_org'
  ) THEN
    CREATE POLICY action_targets_update_org
      ON public.action_targets
      FOR UPDATE
      USING (org_id = public.get_user_org_id())
      WITH CHECK (org_id = public.get_user_org_id());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'action_targets'
      AND policyname = 'action_targets_delete_org'
  ) THEN
    CREATE POLICY action_targets_delete_org
      ON public.action_targets
      FOR DELETE
      USING (org_id = public.get_user_org_id());
  END IF;
END;
$$;
