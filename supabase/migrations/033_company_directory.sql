-- Migration 033: Company Directory
-- Tables for managing org staff/people with roles, tags, and aliases.
-- Used by the ingestion engine to resolve actor names (User column)
-- against known staff before categorizing entities.

-- ── company_people ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_people (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  canonical_name text NOT NULL,  -- normalizePersonName(display_name)
  email        text,
  phone        text,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  source       text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'upload', 'integration')),
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_people_org ON public.company_people(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_people_org_canonical ON public.company_people(org_id, canonical_name);

ALTER TABLE public.company_people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_people_select" ON public.company_people
  FOR SELECT USING (org_id = (SELECT (auth.jwt()->'user_metadata'->>'org_id')::uuid));

CREATE POLICY "company_people_insert" ON public.company_people
  FOR INSERT WITH CHECK (org_id = (SELECT (auth.jwt()->'user_metadata'->>'org_id')::uuid));

CREATE POLICY "company_people_update" ON public.company_people
  FOR UPDATE USING (org_id = (SELECT (auth.jwt()->'user_metadata'->>'org_id')::uuid));

CREATE POLICY "company_people_delete" ON public.company_people
  FOR DELETE USING (org_id = (SELECT (auth.jwt()->'user_metadata'->>'org_id')::uuid));

-- ── company_roles ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key        text NOT NULL,
  label      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_roles_org_key ON public.company_roles(org_id, key);

ALTER TABLE public.company_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_roles_select" ON public.company_roles
  FOR SELECT USING (org_id = (SELECT (auth.jwt()->'user_metadata'->>'org_id')::uuid));

CREATE POLICY "company_roles_insert" ON public.company_roles
  FOR INSERT WITH CHECK (org_id = (SELECT (auth.jwt()->'user_metadata'->>'org_id')::uuid));

CREATE POLICY "company_roles_update" ON public.company_roles
  FOR UPDATE USING (org_id = (SELECT (auth.jwt()->'user_metadata'->>'org_id')::uuid));

CREATE POLICY "company_roles_delete" ON public.company_roles
  FOR DELETE USING (org_id = (SELECT (auth.jwt()->'user_metadata'->>'org_id')::uuid));

-- ── company_role_assignments ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_role_assignments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  person_id  uuid NOT NULL REFERENCES public.company_people(id) ON DELETE CASCADE,
  role_id    uuid NOT NULL REFERENCES public.company_roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_role_asgn_unique ON public.company_role_assignments(person_id, role_id);
CREATE INDEX IF NOT EXISTS idx_company_role_asgn_org ON public.company_role_assignments(org_id);

ALTER TABLE public.company_role_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_role_assignments_select" ON public.company_role_assignments
  FOR SELECT USING (org_id = (SELECT (auth.jwt()->'user_metadata'->>'org_id')::uuid));

CREATE POLICY "company_role_assignments_insert" ON public.company_role_assignments
  FOR INSERT WITH CHECK (org_id = (SELECT (auth.jwt()->'user_metadata'->>'org_id')::uuid));

CREATE POLICY "company_role_assignments_update" ON public.company_role_assignments
  FOR UPDATE USING (org_id = (SELECT (auth.jwt()->'user_metadata'->>'org_id')::uuid));

CREATE POLICY "company_role_assignments_delete" ON public.company_role_assignments
  FOR DELETE USING (org_id = (SELECT (auth.jwt()->'user_metadata'->>'org_id')::uuid));

-- ── company_tags ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  slug       text NOT NULL,
  label      text NOT NULL,
  color      text DEFAULT '#64748B',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_tags_org_slug ON public.company_tags(org_id, slug);

ALTER TABLE public.company_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_tags_select" ON public.company_tags
  FOR SELECT USING (org_id = (SELECT (auth.jwt()->'user_metadata'->>'org_id')::uuid));

CREATE POLICY "company_tags_insert" ON public.company_tags
  FOR INSERT WITH CHECK (org_id = (SELECT (auth.jwt()->'user_metadata'->>'org_id')::uuid));

CREATE POLICY "company_tags_update" ON public.company_tags
  FOR UPDATE USING (org_id = (SELECT (auth.jwt()->'user_metadata'->>'org_id')::uuid));

CREATE POLICY "company_tags_delete" ON public.company_tags
  FOR DELETE USING (org_id = (SELECT (auth.jwt()->'user_metadata'->>'org_id')::uuid));

-- ── company_tag_assignments ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_tag_assignments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  person_id  uuid NOT NULL REFERENCES public.company_people(id) ON DELETE CASCADE,
  tag_id     uuid NOT NULL REFERENCES public.company_tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_tag_asgn_unique ON public.company_tag_assignments(person_id, tag_id);
CREATE INDEX IF NOT EXISTS idx_company_tag_asgn_org ON public.company_tag_assignments(org_id);

ALTER TABLE public.company_tag_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_tag_assignments_select" ON public.company_tag_assignments
  FOR SELECT USING (org_id = (SELECT (auth.jwt()->'user_metadata'->>'org_id')::uuid));

CREATE POLICY "company_tag_assignments_insert" ON public.company_tag_assignments
  FOR INSERT WITH CHECK (org_id = (SELECT (auth.jwt()->'user_metadata'->>'org_id')::uuid));

CREATE POLICY "company_tag_assignments_update" ON public.company_tag_assignments
  FOR UPDATE USING (org_id = (SELECT (auth.jwt()->'user_metadata'->>'org_id')::uuid));

CREATE POLICY "company_tag_assignments_delete" ON public.company_tag_assignments
  FOR DELETE USING (org_id = (SELECT (auth.jwt()->'user_metadata'->>'org_id')::uuid));

-- ── company_person_aliases ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_person_aliases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  person_id       uuid NOT NULL REFERENCES public.company_people(id) ON DELETE CASCADE,
  alias           text NOT NULL,        -- display form
  canonical_alias text NOT NULL,        -- normalizePersonName(alias)
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_alias_org_canonical ON public.company_person_aliases(org_id, canonical_alias);
CREATE INDEX IF NOT EXISTS idx_company_alias_person ON public.company_person_aliases(person_id);

ALTER TABLE public.company_person_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_person_aliases_select" ON public.company_person_aliases
  FOR SELECT USING (org_id = (SELECT (auth.jwt()->'user_metadata'->>'org_id')::uuid));

CREATE POLICY "company_person_aliases_insert" ON public.company_person_aliases
  FOR INSERT WITH CHECK (org_id = (SELECT (auth.jwt()->'user_metadata'->>'org_id')::uuid));

CREATE POLICY "company_person_aliases_update" ON public.company_person_aliases
  FOR UPDATE USING (org_id = (SELECT (auth.jwt()->'user_metadata'->>'org_id')::uuid));

CREATE POLICY "company_person_aliases_delete" ON public.company_person_aliases
  FOR DELETE USING (org_id = (SELECT (auth.jwt()->'user_metadata'->>'org_id')::uuid));
