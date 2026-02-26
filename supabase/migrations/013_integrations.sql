-- Integrations table for external systems connected to Aether.

CREATE TABLE IF NOT EXISTS public.integrations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  type          text NOT NULL,         -- 'google_sheets', 'csv', 'quickbooks', etc.
  name          text NOT NULL,         -- User-given name or auto-detected
  config        jsonb,                 -- Connection config (URLs, tokens, etc.)
  status        text DEFAULT 'active', -- 'active', 'error', 'disconnected'
  last_sync_at  timestamptz,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE IF EXISTS public.integrations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'integrations'
      AND policyname = 'integrations_select_org'
  ) THEN
    CREATE POLICY "Users see own org integrations"
      ON public.integrations
      FOR SELECT
      USING (org_id = public.get_user_org_id());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'integrations'
      AND policyname = 'integrations_manage_org'
  ) THEN
    CREATE POLICY "Users manage own org integrations"
      ON public.integrations
      FOR ALL
      USING (org_id = public.get_user_org_id())
      WITH CHECK (org_id = public.get_user_org_id());
  END IF;
END;
$$;

