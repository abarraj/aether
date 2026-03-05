-- Analytics engine tables: metric definitions, metric snapshots, and compute runs.
-- Provides formula transparency, dataset versioning, and compute audit trail.

-- ============================================================
-- METRIC DEFINITIONS (system + org-defined metric catalogue)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.metric_definitions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID REFERENCES public.organizations(id) ON DELETE CASCADE,  -- NULL = system-defined
  metric_key    TEXT NOT NULL,
  name          TEXT NOT NULL,
  formula       TEXT NOT NULL,                -- human-readable formula description
  description   TEXT,
  category      TEXT NOT NULL DEFAULT 'financial',  -- 'financial', 'operational', 'derived'
  required_fields TEXT[] DEFAULT '{}',        -- column names this metric needs
  unit          TEXT NOT NULL DEFAULT 'currency',   -- 'currency', 'percentage', 'count', 'hours', 'ratio', 'coefficient'
  is_derived    BOOLEAN NOT NULL DEFAULT false,     -- true for variance, correlation, etc.
  source_metrics TEXT[] DEFAULT '{}',               -- for derived metrics: which base metrics feed it
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- System metrics have org_id = NULL; org-specific overrides have org_id set.
-- Unique per (org or system) + metric_key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_metric_definitions_key
  ON public.metric_definitions (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'), metric_key);

CREATE INDEX IF NOT EXISTS idx_metric_definitions_org
  ON public.metric_definitions (org_id);

-- ============================================================
-- SEED SYSTEM METRIC DEFINITIONS (org_id = NULL)
-- ============================================================
INSERT INTO public.metric_definitions (org_id, metric_key, name, formula, description, category, required_fields, unit, is_derived, source_metrics)
VALUES
  (NULL, 'revenue', 'Total Revenue', 'SUM(data_rows.data->>revenue_column) grouped by period', 'Total revenue summed across all data rows in the period.', 'financial', ARRAY['revenue'], 'currency', false, '{}'),
  (NULL, 'labor_cost', 'Staff Costs', 'SUM(data_rows.data->>cost_column) grouped by period', 'Total labor/staff costs summed across all data rows in the period.', 'financial', ARRAY['cost'], 'currency', false, '{}'),
  (NULL, 'labor_hours', 'Labor Hours', 'SUM(data_rows.data->>hours_column) grouped by period', 'Total labor hours summed across all data rows in the period.', 'operational', ARRAY['hours'], 'hours', false, '{}'),
  (NULL, 'attendance', 'Attendance', 'SUM(data_rows.data->>attendance_column) grouped by period', 'Total attendance/check-ins summed across all data rows in the period.', 'operational', ARRAY['attendance'], 'count', false, '{}'),
  (NULL, 'utilization', 'Capacity Utilization', 'AVG(data_rows.data->>utilization_column) grouped by period', 'Average capacity utilization across all data rows in the period.', 'operational', ARRAY['utilization'], 'percentage', false, '{}'),
  (NULL, 'staff_cost_ratio', 'Staff Cost Ratio', '(labor_cost / revenue) * 100', 'Labor costs as a percentage of revenue for the period.', 'derived', '{}', 'percentage', true, ARRAY['revenue', 'labor_cost']),
  (NULL, 'revenue_variance', 'Revenue Variance', 'STDDEV(daily_revenue) / AVG(daily_revenue)', 'Coefficient of variation of daily revenue within the period. Higher values indicate more volatile revenue.', 'derived', '{}', 'coefficient', true, ARRAY['revenue']),
  (NULL, 'labor_cost_variance', 'Staff Cost Variance', 'STDDEV(daily_labor_cost) / AVG(daily_labor_cost)', 'Coefficient of variation of daily staff costs within the period.', 'derived', '{}', 'coefficient', true, ARRAY['labor_cost']),
  (NULL, 'corr_revenue_labor', 'Revenue-Labor Correlation', 'PEARSON(daily_revenue, daily_labor_cost)', 'Pearson correlation between daily revenue and daily staff costs. Values near 1 indicate costs scale with revenue; near 0 indicates fixed costs.', 'derived', '{}', 'coefficient', true, ARRAY['revenue', 'labor_cost']),
  (NULL, 'corr_revenue_attendance', 'Revenue-Attendance Correlation', 'PEARSON(daily_revenue, daily_attendance)', 'Pearson correlation between daily revenue and attendance. High values suggest revenue is attendance-driven.', 'derived', '{}', 'coefficient', true, ARRAY['revenue', 'attendance']),
  (NULL, 'revenue_forecast', 'Revenue Forecast', 'AVG(daily_revenue) * days_in_period', 'Projected revenue for the period based on average daily revenue from available data.', 'derived', '{}', 'currency', true, ARRAY['revenue'])
ON CONFLICT DO NOTHING;

-- ============================================================
-- METRIC SNAPSHOTS (computed metric values per period)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.metric_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  metric_key      TEXT NOT NULL,
  period          TEXT NOT NULL,                   -- 'daily', 'weekly', 'monthly'
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  value           NUMERIC,
  dimensions      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- dimensional breakdown: { "location": "NYC" }
  dataset_version TEXT,                            -- composite hash of contributing stream versions
  source_uploads  UUID[] DEFAULT '{}',             -- upload IDs that contributed
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  compute_run_id  UUID                             -- FK added after compute_runs table exists
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_metric_snapshots_unique
  ON public.metric_snapshots (org_id, metric_key, period, period_start, COALESCE(dimensions::text, '{}'));

CREATE INDEX IF NOT EXISTS idx_metric_snapshots_org_period
  ON public.metric_snapshots (org_id, period, period_start);

CREATE INDEX IF NOT EXISTS idx_metric_snapshots_org_key
  ON public.metric_snapshots (org_id, metric_key);

CREATE INDEX IF NOT EXISTS idx_metric_snapshots_computed
  ON public.metric_snapshots (org_id, computed_at DESC);

-- ============================================================
-- COMPUTE RUNS (audit trail for metric computation)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.compute_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trigger         TEXT NOT NULL DEFAULT 'upload',  -- 'upload', 'stream_change', 'manual', 'scheduled'
  trigger_ref     UUID,                            -- upload_id or stream_id that triggered
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'running', 'completed', 'failed'
  metrics_computed INTEGER DEFAULT 0,
  rows_processed  INTEGER DEFAULT 0,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  duration_ms     INTEGER,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compute_runs_org_status
  ON public.compute_runs (org_id, status);

CREATE INDEX IF NOT EXISTS idx_compute_runs_org_latest
  ON public.compute_runs (org_id, created_at DESC);

-- Add FK from metric_snapshots to compute_runs now that both exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'metric_snapshots_compute_run_fk'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.metric_snapshots
      ADD CONSTRAINT metric_snapshots_compute_run_fk
      FOREIGN KEY (compute_run_id) REFERENCES public.compute_runs(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE public.metric_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metric_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compute_runs ENABLE ROW LEVEL SECURITY;

-- metric_definitions: users can see system metrics (org_id IS NULL) + their own org metrics
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'metric_definitions' AND policyname = 'metric_definitions_select'
  ) THEN
    CREATE POLICY metric_definitions_select ON public.metric_definitions
      FOR SELECT USING (org_id IS NULL OR org_id = public.get_user_org_id());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'metric_definitions' AND policyname = 'metric_definitions_insert_org'
  ) THEN
    CREATE POLICY metric_definitions_insert_org ON public.metric_definitions
      FOR INSERT WITH CHECK (org_id = public.get_user_org_id());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'metric_definitions' AND policyname = 'metric_definitions_update_org'
  ) THEN
    CREATE POLICY metric_definitions_update_org ON public.metric_definitions
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
    WHERE schemaname = 'public' AND tablename = 'metric_definitions' AND policyname = 'metric_definitions_delete_org'
  ) THEN
    CREATE POLICY metric_definitions_delete_org ON public.metric_definitions
      FOR DELETE USING (org_id = public.get_user_org_id());
  END IF;
END;
$$;

-- metric_snapshots: scoped by org_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'metric_snapshots' AND policyname = 'metric_snapshots_select_org'
  ) THEN
    CREATE POLICY metric_snapshots_select_org ON public.metric_snapshots
      FOR SELECT USING (org_id = public.get_user_org_id());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'metric_snapshots' AND policyname = 'metric_snapshots_insert_org'
  ) THEN
    CREATE POLICY metric_snapshots_insert_org ON public.metric_snapshots
      FOR INSERT WITH CHECK (org_id = public.get_user_org_id());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'metric_snapshots' AND policyname = 'metric_snapshots_update_org'
  ) THEN
    CREATE POLICY metric_snapshots_update_org ON public.metric_snapshots
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
    WHERE schemaname = 'public' AND tablename = 'metric_snapshots' AND policyname = 'metric_snapshots_delete_org'
  ) THEN
    CREATE POLICY metric_snapshots_delete_org ON public.metric_snapshots
      FOR DELETE USING (org_id = public.get_user_org_id());
  END IF;
END;
$$;

-- compute_runs: scoped by org_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'compute_runs' AND policyname = 'compute_runs_select_org'
  ) THEN
    CREATE POLICY compute_runs_select_org ON public.compute_runs
      FOR SELECT USING (org_id = public.get_user_org_id());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'compute_runs' AND policyname = 'compute_runs_insert_org'
  ) THEN
    CREATE POLICY compute_runs_insert_org ON public.compute_runs
      FOR INSERT WITH CHECK (org_id = public.get_user_org_id());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'compute_runs' AND policyname = 'compute_runs_update_org'
  ) THEN
    CREATE POLICY compute_runs_update_org ON public.compute_runs
      FOR UPDATE
      USING (org_id = public.get_user_org_id())
      WITH CHECK (org_id = public.get_user_org_id());
  END IF;
END;
$$;
