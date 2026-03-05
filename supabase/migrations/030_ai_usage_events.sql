-- AI usage events: append-only log of every AI model call for credit metering.
-- 1 row = 1 credit (successful requests only are counted toward limits).

CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  route text NOT NULL,            -- 'chat' | 'spotlight'
  model text NOT NULL,            -- e.g. 'claude-sonnet-4-5-20250929'
  tokens_in int NOT NULL DEFAULT 0,
  tokens_out int NOT NULL DEFAULT 0,
  success boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Primary query pattern: count credits used in current billing cycle.
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_org_created
  ON public.ai_usage_events (org_id, created_at);

-- Per-route breakdowns (e.g. chat vs spotlight usage).
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_org_route
  ON public.ai_usage_events (org_id, route);

-- Enable RLS.
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

-- RLS policies: org-scoped access (same pattern as performance_gaps).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_usage_events'
      AND policyname = 'ai_usage_events_select_org'
  ) THEN
    CREATE POLICY ai_usage_events_select_org
      ON public.ai_usage_events
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
      AND tablename = 'ai_usage_events'
      AND policyname = 'ai_usage_events_insert_org'
  ) THEN
    CREATE POLICY ai_usage_events_insert_org
      ON public.ai_usage_events
      FOR INSERT
      WITH CHECK (org_id = public.get_user_org_id());
  END IF;
END;
$$;

-- No UPDATE or DELETE policies: this is an append-only audit log.
-- Only service-role (admin) can modify or purge rows if ever needed.
