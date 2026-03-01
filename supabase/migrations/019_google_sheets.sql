-- Google Sheets connected sources for live data sync.

CREATE TABLE IF NOT EXISTS public.connected_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users (id),
  sheet_url text NOT NULL,
  sheet_id text NOT NULL,
  sheet_name text,
  tab_name text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  last_sync_at timestamptz,
  sync_interval_minutes integer NOT NULL DEFAULT 60,
  sync_status text NOT NULL DEFAULT 'pending',
  row_count integer,
  upload_id uuid REFERENCES public.uploads (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.connected_sheets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'connected_sheets'
      AND policyname = 'connected_sheets_org_select'
  ) THEN
    CREATE POLICY connected_sheets_org_select
      ON public.connected_sheets
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
      AND tablename = 'connected_sheets'
      AND policyname = 'connected_sheets_org_insert'
  ) THEN
    CREATE POLICY connected_sheets_org_insert
      ON public.connected_sheets
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
      AND tablename = 'connected_sheets'
      AND policyname = 'connected_sheets_org_delete'
  ) THEN
    CREATE POLICY connected_sheets_org_delete
      ON public.connected_sheets
      FOR DELETE
      USING (org_id = public.get_user_org_id());
  END IF;
END;
$$;

-- Also add source_column to entity_types if not present
ALTER TABLE entity_types ADD COLUMN IF NOT EXISTS source_column text;
