-- Row Level Security and access policies for all core Aether tables.

-- Helper function to fetch the current user's organization id from profiles.
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id
  FROM public.profiles
  WHERE id = auth.uid();
$$;

-- Enable RLS on all multi-tenant tables.
ALTER TABLE IF EXISTS public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.data_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.kpi_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ai_messages ENABLE ROW LEVEL SECURITY;

-- Organizations: users can see only their own organization.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organizations'
      AND policyname = 'organizations_select_own'
  ) THEN
    CREATE POLICY organizations_select_own
      ON public.organizations
      FOR SELECT
      USING (id = public.get_user_org_id());
  END IF;
END;
$$;

-- Organizations: owners can update their own organization.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organizations'
      AND policyname = 'organizations_update_owner'
  ) THEN
    CREATE POLICY organizations_update_owner
      ON public.organizations
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.org_id = organizations.id
            AND p.role = 'owner'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.org_id = organizations.id
            AND p.role = 'owner'
        )
      );
  END IF;
END;
$$;

-- Profiles: users can see members of their organization and their own profile.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'profiles_select_org_members'
  ) THEN
    CREATE POLICY profiles_select_org_members
      ON public.profiles
      FOR SELECT
      USING (
        id = auth.uid()
        OR org_id = public.get_user_org_id()
      );
  END IF;
END;
$$;

-- Profiles: users can update their own profile; owners can update within their org.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'profiles_update_self_or_owner'
  ) THEN
    CREATE POLICY profiles_update_self_or_owner
      ON public.profiles
      FOR UPDATE
      USING (
        id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.org_id = profiles.org_id
            AND p.role = 'owner'
        )
      )
      WITH CHECK (
        id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.org_id = profiles.org_id
            AND p.role = 'owner'
        )
      );
  END IF;
END;
$$;

-- Uploads: users can access uploads only within their own organization.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'uploads'
      AND policyname = 'uploads_select_org'
  ) THEN
    CREATE POLICY uploads_select_org
      ON public.uploads
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
      AND tablename = 'uploads'
      AND policyname = 'uploads_insert_org'
  ) THEN
    CREATE POLICY uploads_insert_org
      ON public.uploads
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
      AND tablename = 'uploads'
      AND policyname = 'uploads_update_org'
  ) THEN
    CREATE POLICY uploads_update_org
      ON public.uploads
      FOR UPDATE
      USING (org_id = public.get_user_org_id())
      WITH CHECK (org_id = public.get_user_org_id());
  END IF;
END;
$$;

-- Data rows: users can access analytic rows only within their own organization.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'data_rows'
      AND policyname = 'data_rows_select_org'
  ) THEN
    CREATE POLICY data_rows_select_org
      ON public.data_rows
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
      AND tablename = 'data_rows'
      AND policyname = 'data_rows_insert_org'
  ) THEN
    CREATE POLICY data_rows_insert_org
      ON public.data_rows
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
      AND tablename = 'data_rows'
      AND policyname = 'data_rows_update_org'
  ) THEN
    CREATE POLICY data_rows_update_org
      ON public.data_rows
      FOR UPDATE
      USING (org_id = public.get_user_org_id())
      WITH CHECK (org_id = public.get_user_org_id());
  END IF;
END;
$$;

-- KPI snapshots: scoped by organization for read/write.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'kpi_snapshots'
      AND policyname = 'kpi_snapshots_select_org'
  ) THEN
    CREATE POLICY kpi_snapshots_select_org
      ON public.kpi_snapshots
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
      AND tablename = 'kpi_snapshots'
      AND policyname = 'kpi_snapshots_insert_org'
  ) THEN
    CREATE POLICY kpi_snapshots_insert_org
      ON public.kpi_snapshots
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
      AND tablename = 'kpi_snapshots'
      AND policyname = 'kpi_snapshots_update_org'
  ) THEN
    CREATE POLICY kpi_snapshots_update_org
      ON public.kpi_snapshots
      FOR UPDATE
      USING (org_id = public.get_user_org_id())
      WITH CHECK (org_id = public.get_user_org_id());
  END IF;
END;
$$;

-- Alerts: users can see and manage alerts only within their organization.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'alerts'
      AND policyname = 'alerts_select_org'
  ) THEN
    CREATE POLICY alerts_select_org
      ON public.alerts
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
      AND tablename = 'alerts'
      AND policyname = 'alerts_insert_org'
  ) THEN
    CREATE POLICY alerts_insert_org
      ON public.alerts
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
      AND tablename = 'alerts'
      AND policyname = 'alerts_update_org'
  ) THEN
    CREATE POLICY alerts_update_org
      ON public.alerts
      FOR UPDATE
      USING (org_id = public.get_user_org_id())
      WITH CHECK (org_id = public.get_user_org_id());
  END IF;
END;
$$;

-- AI conversations: scoped by organization for read/write access.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_conversations'
      AND policyname = 'ai_conversations_select_org'
  ) THEN
    CREATE POLICY ai_conversations_select_org
      ON public.ai_conversations
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
      AND tablename = 'ai_conversations'
      AND policyname = 'ai_conversations_insert_org'
  ) THEN
    CREATE POLICY ai_conversations_insert_org
      ON public.ai_conversations
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
      AND tablename = 'ai_conversations'
      AND policyname = 'ai_conversations_update_org'
  ) THEN
    CREATE POLICY ai_conversations_update_org
      ON public.ai_conversations
      FOR UPDATE
      USING (org_id = public.get_user_org_id())
      WITH CHECK (org_id = public.get_user_org_id());
  END IF;
END;
$$;

-- AI messages: scoped by organization via org_id column.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_messages'
      AND policyname = 'ai_messages_select_org'
  ) THEN
    CREATE POLICY ai_messages_select_org
      ON public.ai_messages
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
      AND tablename = 'ai_messages'
      AND policyname = 'ai_messages_insert_org'
  ) THEN
    CREATE POLICY ai_messages_insert_org
      ON public.ai_messages
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
      AND tablename = 'ai_messages'
      AND policyname = 'ai_messages_update_org'
  ) THEN
    CREATE POLICY ai_messages_update_org
      ON public.ai_messages
      FOR UPDATE
      USING (org_id = public.get_user_org_id())
      WITH CHECK (org_id = public.get_user_org_id());
  END IF;
END;
$$;

