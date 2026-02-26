-- ============================================================
-- ENTITY TYPES (the business's data model: Instructor, Class, Location, etc.)
-- ============================================================
CREATE TABLE public.entity_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,                -- 'Instructor', 'Class', 'Location', 'Product'
  slug        TEXT NOT NULL,                -- 'instructor', 'class', 'location'
  description TEXT,                         -- User-facing description
  icon        TEXT DEFAULT 'circle',        -- Lucide icon name
  color       TEXT DEFAULT '#10B981',       -- Hex color for UI nodes
  properties  JSONB NOT NULL DEFAULT '[]',  -- [{ key: "revenue", label: "Revenue", type: "currency" }, ...]
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, slug)
);

-- ============================================================
-- ENTITIES (actual instances: "John Smith", "Morning Lagree", "Downtown Studio")
-- ============================================================
CREATE TABLE public.entities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  entity_type_id  UUID REFERENCES public.entity_types(id) ON DELETE CASCADE NOT NULL,
  name            TEXT NOT NULL,
  properties      JSONB DEFAULT '{}',        -- { revenue: 45000, email: "john@gym.com", capacity: 20 }
  source_upload_id UUID REFERENCES public.uploads(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entities_org_type ON public.entities(org_id, entity_type_id);

-- ============================================================
-- RELATIONSHIP TYPES (defines how entity types connect)
-- ============================================================
CREATE TABLE public.relationship_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  name            TEXT NOT NULL,              -- 'teaches', 'works_at', 'belongs_to', 'generates'
  from_type_id    UUID REFERENCES public.entity_types(id) ON DELETE CASCADE NOT NULL,
  to_type_id      UUID REFERENCES public.entity_types(id) ON DELETE CASCADE NOT NULL,
  description     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, name, from_type_id, to_type_id)
);

-- ============================================================
-- ENTITY RELATIONSHIPS (actual connections between entities)
-- ============================================================
CREATE TABLE public.entity_relationships (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  relationship_type_id  UUID REFERENCES public.relationship_types(id) ON DELETE CASCADE NOT NULL,
  from_entity_id        UUID REFERENCES public.entities(id) ON DELETE CASCADE NOT NULL,
  to_entity_id          UUID REFERENCES public.entities(id) ON DELETE CASCADE NOT NULL,
  properties            JSONB DEFAULT '{}',   -- metadata on the relationship
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_relationships_from ON public.entity_relationships(from_entity_id);
CREATE INDEX idx_relationships_to ON public.entity_relationships(to_entity_id);

-- ============================================================
-- RLS for all ontology tables
-- ============================================================
ALTER TABLE public.entity_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own org entity_types" ON public.entity_types
  FOR ALL USING (org_id = public.get_user_org_id());

CREATE POLICY "Users see own org entities" ON public.entities
  FOR ALL USING (org_id = public.get_user_org_id());

CREATE POLICY "Users see own org relationship_types" ON public.relationship_types
  FOR ALL USING (org_id = public.get_user_org_id());

CREATE POLICY "Users see own org entity_relationships" ON public.entity_relationships
  FOR ALL USING (org_id = public.get_user_org_id());
