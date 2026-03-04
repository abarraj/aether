-- RBAC hardening: canonical role enum, profile constraints, RLS policy
-- updates, and role_audit_log table.
--
-- DO NOT EXECUTE AUTOMATICALLY — review and apply manually.

-- ============================================================
-- 1. Add CHECK constraint for canonical roles on profiles
-- ============================================================

-- Map legacy 'member' role to 'editor' before adding constraint.
UPDATE public.profiles
  SET role = 'editor', updated_at = now()
  WHERE role = 'member';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'admin', 'editor', 'viewer'));

-- Update the default from 'member' to 'viewer' for invited users.
ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'viewer';

-- ============================================================
-- 2. Add CHECK constraint for invite roles
-- ============================================================

-- Map legacy 'member' invites to 'editor'.
UPDATE public.invites
  SET role = 'editor'
  WHERE role = 'member';

ALTER TABLE public.invites
  DROP CONSTRAINT IF EXISTS invites_role_check;

ALTER TABLE public.invites
  ADD CONSTRAINT invites_role_check
  CHECK (role IN ('admin', 'editor', 'viewer'));

-- ============================================================
-- 3. Assign 'owner' role to org creators who are still 'editor'
--    (users whose profile.org_id matches an org they created,
--     identified as the earliest profile in that org).
-- ============================================================

UPDATE public.profiles p
  SET role = 'owner', updated_at = now()
  WHERE p.org_id IS NOT NULL
    AND p.role != 'owner'
    AND p.id = (
      SELECT pp.id
      FROM public.profiles pp
      WHERE pp.org_id = p.org_id
      ORDER BY pp.created_at ASC
      LIMIT 1
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.profiles pp2
      WHERE pp2.org_id = p.org_id
        AND pp2.role = 'owner'
    );

-- ============================================================
-- 4. Update profile RLS — allow owner OR admin to update
--    other members (for team management).
-- ============================================================

DROP POLICY IF EXISTS profiles_update_self_or_owner ON public.profiles;

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
        AND p.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.org_id = profiles.org_id
        AND p.role IN ('owner', 'admin')
    )
  );

-- ============================================================
-- 5. Add DELETE policy for profiles (owner/admin can remove
--    members; users can remove themselves).
-- ============================================================

DROP POLICY IF EXISTS profiles_delete_org ON public.profiles;

CREATE POLICY profiles_delete_org
  ON public.profiles
  FOR DELETE
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.org_id = profiles.org_id
        AND p.role IN ('owner', 'admin')
    )
  );

-- ============================================================
-- 6. Organizations INSERT policy — allow authenticated users
--    to create new organizations (needed for onboarding).
-- ============================================================

DROP POLICY IF EXISTS organizations_insert_authenticated ON public.organizations;

CREATE POLICY organizations_insert_authenticated
  ON public.organizations
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- 7. role_audit_log — immutable log of role changes
-- ============================================================

CREATE TABLE IF NOT EXISTS public.role_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  changed_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  old_role text NOT NULL,
  new_role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_role_audit_log_org
  ON public.role_audit_log (org_id, created_at DESC);

ALTER TABLE public.role_audit_log ENABLE ROW LEVEL SECURITY;

-- Only owner/admin can view role audit log for their org.
CREATE POLICY role_audit_log_select ON public.role_audit_log
  FOR SELECT
  USING (org_id IN (
    SELECT p.org_id FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('owner', 'admin')
  ));

-- Insert allowed for owner/admin (server writes via authenticated client).
CREATE POLICY role_audit_log_insert ON public.role_audit_log
  FOR INSERT
  WITH CHECK (org_id IN (
    SELECT p.org_id FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('owner', 'admin')
  ));

-- No UPDATE or DELETE — audit log is immutable.

-- ============================================================
-- 8. Helper: get_user_role() for use in RLS policies
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid();
$$;
