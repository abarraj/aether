-- Audit log for tracking all sensitive and operational actions in Aether.

CREATE TABLE IF NOT EXISTS public.audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  actor_id    uuid REFERENCES public.profiles(id),
  actor_email text,
  action      text NOT NULL,         -- 'user.login', 'user.invite', 'data.upload', 'data.delete', 'settings.update', 'org.update', 'ai.query', 'alert.dismiss', 'member.remove', 'role.change', 'export.download', 'api_key.create', 'api_key.revoke'
  target_type text,                  -- 'user', 'upload', 'organization', 'alert', 'api_key', 'settings'
  target_id   text,                  -- ID of the affected resource
  description text NOT NULL,         -- Human-readable: "Andrew uploaded revenue-q3.csv"
  metadata    jsonb,                 -- Additional context: { ip, user_agent, old_value, new_value }
  ip_address  text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_org_created
  ON public.audit_log(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_org_action
  ON public.audit_log(org_id, action);

-- RLS
ALTER TABLE IF EXISTS public.audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_log'
      AND policyname = 'audit_log_select_org'
  ) THEN
    CREATE POLICY "Users see own org audit log"
      ON public.audit_log
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
      AND tablename = 'audit_log'
      AND policyname = 'audit_log_insert_org'
  ) THEN
    CREATE POLICY "System inserts audit log"
      ON public.audit_log
      FOR INSERT
      WITH CHECK (org_id = public.get_user_org_id());
  END IF;
END;
$$;

