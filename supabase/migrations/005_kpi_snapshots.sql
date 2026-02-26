-- KPI snapshots table capturing aggregated metrics for reporting periods.

-- Each snapshot represents metrics for a given organization, period, and date.
CREATE TABLE IF NOT EXISTS public.kpi_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id),
  period text NOT NULL,
  date date NOT NULL,
  metrics jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure only one snapshot per organization, period, and date.
CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_snapshots_org_period_date
  ON public.kpi_snapshots (org_id, period, date);

