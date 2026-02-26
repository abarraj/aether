-- API keys for programmatic access to Aether.

CREATE TABLE IF NOT EXISTS public.api_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  created_by    uuid REFERENCES public.profiles(id),
  name          text NOT NULL,           -- User-given name: "Production", "Staging", etc.
  key_prefix    text NOT NULL,           -- Prefix used for display and lookup.
  key_hash      text NOT NULL,           -- SHA-256 hash of the full key (never store plaintext)
  last_used_at  timestamptz,
  expires_at    timestamptz,             -- NULL = never expires
  is_active     boolean DEFAULT true,
  permissions   jsonb DEFAULT '["read"]'::jsonb,  -- ['read', 'write', 'admin']
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE IF EXISTS public.api_keys ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'api_keys'
      AND policyname = 'api_keys_select_org'
  ) THEN
    CREATE POLICY "Users see own org api keys"
      ON public.api_keys
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
      AND tablename = 'api_keys'
      AND policyname = 'api_keys_manage_org'
  ) THEN
    CREATE POLICY "Users manage own org api keys"
      ON public.api_keys
      FOR ALL
      USING (org_id = public.get_user_org_id())
      WITH CHECK (org_id = public.get_user_org_id());
  END IF;
END;
$$;

