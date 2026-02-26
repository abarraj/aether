-- Data rows table storing normalized, queryable records derived from uploads.

-- Each row belongs to an organization and optionally references its source upload.
CREATE TABLE IF NOT EXISTS public.data_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id),
  upload_id uuid REFERENCES public.uploads (id) ON DELETE SET NULL,
  data_type text NOT NULL,
  data jsonb NOT NULL,
  date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient time-series filtering by organization, data type, and date.
CREATE INDEX IF NOT EXISTS idx_data_rows_org_type_date
  ON public.data_rows (org_id, data_type, date);

