-- Migration 035: Actor resolutions table.
-- Stores user decisions when resolving ambiguous actors flagged by
-- the role inference engine ("Review needed" items).
-- Each resolution confirms whether an actor is STAFF, CLIENT, or SYSTEM.
-- Resolutions feed back into the staff_roster_overrides table and
-- update the mapping_run's review_questions payload.

CREATE TABLE IF NOT EXISTS public.actor_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  mapping_run_id uuid REFERENCES public.mapping_runs (id) ON DELETE SET NULL,
  review_question_id text NOT NULL,
  actor_name text NOT NULL,
  normalized_name text NOT NULL,
  resolution text NOT NULL CHECK (resolution IN ('staff', 'client', 'system', 'ignore')),
  resolved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  resolved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One resolution per actor per org.
CREATE UNIQUE INDEX IF NOT EXISTS idx_actor_resolutions_org_name
  ON public.actor_resolutions (org_id, normalized_name);

CREATE INDEX IF NOT EXISTS idx_actor_resolutions_org
  ON public.actor_resolutions (org_id);

ALTER TABLE public.actor_resolutions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'actor_resolutions'
      AND policyname = 'actor_resolutions_select_org'
  ) THEN
    CREATE POLICY actor_resolutions_select_org
      ON public.actor_resolutions
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
      AND tablename = 'actor_resolutions'
      AND policyname = 'actor_resolutions_insert_org'
  ) THEN
    CREATE POLICY actor_resolutions_insert_org
      ON public.actor_resolutions
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
      AND tablename = 'actor_resolutions'
      AND policyname = 'actor_resolutions_update_org'
  ) THEN
    CREATE POLICY actor_resolutions_update_org
      ON public.actor_resolutions
      FOR UPDATE
      USING (org_id = public.get_user_org_id());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'actor_resolutions'
      AND policyname = 'actor_resolutions_delete_org'
  ) THEN
    CREATE POLICY actor_resolutions_delete_org
      ON public.actor_resolutions
      FOR DELETE
      USING (org_id = public.get_user_org_id());
  END IF;
END;
$$;
