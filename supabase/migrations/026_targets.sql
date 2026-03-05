-- Metric-based targets for revenue, cost ceilings, utilization, and growth.
-- Targets are evaluated by the compute engine after each metric computation
-- and can trigger alerts when missed.

-- ============================================================
-- TARGETS (metric-level goals with comparators)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.targets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  metric_key      TEXT NOT NULL,                     -- 'revenue', 'labor_cost', 'utilization', etc.
  dimension_field TEXT,                              -- optional: 'location', 'instructor', etc.
  dimension_value TEXT,                              -- optional: 'NYC', 'John Smith', etc.
  period          TEXT NOT NULL DEFAULT 'monthly',   -- 'daily', 'weekly', 'monthly'
  target_value    NUMERIC NOT NULL,                  -- the target number
  comparator      TEXT NOT NULL DEFAULT 'gte',       -- 'gte' (>=), 'lte' (<=), 'eq' (=)
  label           TEXT,                              -- user-friendly description
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'active',    -- 'active', 'paused', 'completed'
  current_value   NUMERIC,                           -- latest actual from compute engine
  current_met     BOOLEAN NOT NULL DEFAULT false,    -- whether target is currently met
  last_evaluated_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_targets_org_status
  ON public.targets (org_id, status);

CREATE INDEX IF NOT EXISTS idx_targets_org_metric
  ON public.targets (org_id, metric_key, period);

CREATE INDEX IF NOT EXISTS idx_targets_org_dimension
  ON public.targets (org_id, dimension_field, dimension_value)
  WHERE dimension_field IS NOT NULL;

-- Prevent duplicate active targets for the same metric + dimension + period
CREATE UNIQUE INDEX IF NOT EXISTS idx_targets_unique_active
  ON public.targets (
    org_id,
    metric_key,
    period,
    COALESCE(dimension_field, ''),
    COALESCE(dimension_value, '')
  )
  WHERE status = 'active';

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE public.targets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'targets' AND policyname = 'targets_select_org'
  ) THEN
    CREATE POLICY targets_select_org ON public.targets
      FOR SELECT USING (org_id = public.get_user_org_id());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'targets' AND policyname = 'targets_insert_org'
  ) THEN
    CREATE POLICY targets_insert_org ON public.targets
      FOR INSERT WITH CHECK (org_id = public.get_user_org_id());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'targets' AND policyname = 'targets_update_org'
  ) THEN
    CREATE POLICY targets_update_org ON public.targets
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
    WHERE schemaname = 'public' AND tablename = 'targets' AND policyname = 'targets_delete_org'
  ) THEN
    CREATE POLICY targets_delete_org ON public.targets
      FOR DELETE USING (org_id = public.get_user_org_id());
  END IF;
END;
$$;
