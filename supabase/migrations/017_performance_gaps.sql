-- Performance gaps table for tracking actual vs expected metrics by dimension.

CREATE TABLE IF NOT EXISTS public.performance_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  upload_id uuid REFERENCES public.uploads (id) ON DELETE SET NULL,
  metric text NOT NULL DEFAULT 'revenue',
  period text NOT NULL DEFAULT 'weekly',
  period_start date NOT NULL,
  dimension_field text NOT NULL,
  dimension_value text NOT NULL,
  actual_value numeric NOT NULL DEFAULT 0,
  expected_value numeric NOT NULL DEFAULT 0,
  gap_value numeric NOT NULL DEFAULT 0,
  gap_pct numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint for upsert.
CREATE UNIQUE INDEX IF NOT EXISTS idx_performance_gaps_upsert
  ON public.performance_gaps (
    org_id,
    upload_id,
    metric,
    period,
    period_start,
    dimension_field,
    dimension_value
  );

-- Indexes for common queries.
CREATE INDEX IF NOT EXISTS idx_performance_gaps_org_period
  ON public.performance_gaps (org_id, period, period_start);

CREATE INDEX IF NOT EXISTS idx_performance_gaps_org_dimension_field
  ON public.performance_gaps (org_id, dimension_field);

CREATE INDEX IF NOT EXISTS idx_performance_gaps_org_dimension_value
  ON public.performance_gaps (org_id, dimension_value);

-- Enable RLS.
ALTER TABLE public.performance_gaps ENABLE ROW LEVEL SECURITY;

-- RLS policies mirroring uploads: org-scoped access.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'performance_gaps'
      AND policyname = 'performance_gaps_select_org'
  ) THEN
    CREATE POLICY performance_gaps_select_org
      ON public.performance_gaps
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
      AND tablename = 'performance_gaps'
      AND policyname = 'performance_gaps_insert_org'
  ) THEN
    CREATE POLICY performance_gaps_insert_org
      ON public.performance_gaps
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
      AND tablename = 'performance_gaps'
      AND policyname = 'performance_gaps_update_org'
  ) THEN
    CREATE POLICY performance_gaps_update_org
      ON public.performance_gaps
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
      AND tablename = 'performance_gaps'
      AND policyname = 'performance_gaps_delete_org'
  ) THEN
    CREATE POLICY performance_gaps_delete_org
      ON public.performance_gaps
      FOR DELETE
      USING (org_id = public.get_user_org_id());
  END IF;
END;
$$;
