-- Uploads table tracking raw data files ingested into Aether.

-- Each upload belongs to an organization and optionally a specific profile.
CREATE TABLE IF NOT EXISTS public.uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id),
  uploaded_by uuid REFERENCES public.profiles (id),
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint,
  data_type text NOT NULL,
  row_count integer,
  column_mapping jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

