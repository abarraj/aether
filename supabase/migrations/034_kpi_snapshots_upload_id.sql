-- Migration 034: Add upload_id to kpi_snapshots
-- Enables scoped deletion when a single upload is removed,
-- instead of nuking all org KPI snapshots.

ALTER TABLE public.kpi_snapshots
  ADD COLUMN IF NOT EXISTS upload_id uuid REFERENCES public.uploads(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_upload_id ON public.kpi_snapshots(upload_id);

-- Drop the old unique constraint (org_id, period, date) and replace with
-- one that includes upload_id, so multiple uploads can contribute snapshots.
DROP INDEX IF EXISTS idx_kpi_snapshots_org_period_date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_snapshots_org_period_date_upload
  ON public.kpi_snapshots (org_id, period, date, upload_id);
