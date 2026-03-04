-- Data streams, stream versions, and mapping runs for multi-stream
-- data ingestion pipeline with staging → validated → committed lifecycle.

-- ============================================================
-- DATA STREAMS (persistent data sources: CSV uploads, integrations, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.data_streams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  source_type TEXT NOT NULL DEFAULT 'csv_upload',  -- 'csv_upload', 'google_sheets', 'api'
  data_type   TEXT,                                -- matches uploads.data_type / data_rows.data_type
  status      TEXT NOT NULL DEFAULT 'active',      -- 'active', 'paused', 'archived'
  config      JSONB DEFAULT '{}'::jsonb,           -- source-specific config (sheet id, api endpoint, etc.)
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_streams_org_status
  ON public.data_streams(org_id, status);

-- ============================================================
-- STREAM VERSIONS (immutable snapshots within a stream)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stream_versions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stream_id        UUID NOT NULL REFERENCES public.data_streams(id) ON DELETE CASCADE,
  upload_id        UUID REFERENCES public.uploads(id) ON DELETE SET NULL,
  version          INTEGER NOT NULL DEFAULT 1,
  file_checksum    TEXT,                           -- SHA-256 for dedup detection
  row_count        INTEGER,
  status           TEXT NOT NULL DEFAULT 'staging', -- 'staging', 'validated', 'committed', 'rejected'
  error_message    TEXT,
  uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  validated_at     TIMESTAMPTZ,
  committed_at     TIMESTAMPTZ,
  committed_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_stream_versions_stream
  ON public.stream_versions(stream_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_stream_versions_org_status
  ON public.stream_versions(org_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stream_versions_stream_version
  ON public.stream_versions(stream_id, version);

-- ============================================================
-- MAPPING RUNS (AI-driven column/entity mapping with confidence)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mapping_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stream_version_id UUID NOT NULL REFERENCES public.stream_versions(id) ON DELETE CASCADE,
  column_mapping    JSONB NOT NULL DEFAULT '{}'::jsonb,    -- { "source_col": "target_field", ... }
  entity_mapping    JSONB NOT NULL DEFAULT '[]'::jsonb,    -- [{ entity_type, field, confidence, ... }]
  overall_confidence NUMERIC(5,4) DEFAULT 0,               -- 0.0000 to 1.0000
  needs_review      BOOLEAN NOT NULL DEFAULT true,
  review_status     TEXT NOT NULL DEFAULT 'pending',       -- 'pending', 'approved', 'rejected'
  approved_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mapping_runs_version
  ON public.mapping_runs(stream_version_id);

CREATE INDEX IF NOT EXISTS idx_mapping_runs_org_review
  ON public.mapping_runs(org_id, review_status);

-- ============================================================
-- ADD STREAM REFERENCES TO EXISTING TABLES
-- ============================================================

-- uploads: link to stream
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'uploads' AND column_name = 'stream_id'
  ) THEN
    ALTER TABLE public.uploads
      ADD COLUMN stream_id UUID REFERENCES public.data_streams(id) ON DELETE SET NULL;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'uploads' AND column_name = 'stream_version_id'
  ) THEN
    ALTER TABLE public.uploads
      ADD COLUMN stream_version_id UUID REFERENCES public.stream_versions(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- data_rows: link to stream version for traceability
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'data_rows' AND column_name = 'stream_id'
  ) THEN
    ALTER TABLE public.data_rows
      ADD COLUMN stream_id UUID REFERENCES public.data_streams(id) ON DELETE SET NULL;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'data_rows' AND column_name = 'stream_version_id'
  ) THEN
    ALTER TABLE public.data_rows
      ADD COLUMN stream_version_id UUID REFERENCES public.stream_versions(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE public.data_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stream_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mapping_runs ENABLE ROW LEVEL SECURITY;

-- data_streams: select, insert, update scoped by org_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'data_streams' AND policyname = 'data_streams_select_org'
  ) THEN
    CREATE POLICY data_streams_select_org ON public.data_streams
      FOR SELECT USING (org_id = public.get_user_org_id());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'data_streams' AND policyname = 'data_streams_insert_org'
  ) THEN
    CREATE POLICY data_streams_insert_org ON public.data_streams
      FOR INSERT WITH CHECK (org_id = public.get_user_org_id());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'data_streams' AND policyname = 'data_streams_update_org'
  ) THEN
    CREATE POLICY data_streams_update_org ON public.data_streams
      FOR UPDATE
      USING (org_id = public.get_user_org_id())
      WITH CHECK (org_id = public.get_user_org_id());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'data_streams' AND policyname = 'data_streams_delete_org'
  ) THEN
    CREATE POLICY data_streams_delete_org ON public.data_streams
      FOR DELETE USING (org_id = public.get_user_org_id());
  END IF;
END;
$$;

-- stream_versions: select, insert, update scoped by org_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stream_versions' AND policyname = 'stream_versions_select_org'
  ) THEN
    CREATE POLICY stream_versions_select_org ON public.stream_versions
      FOR SELECT USING (org_id = public.get_user_org_id());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stream_versions' AND policyname = 'stream_versions_insert_org'
  ) THEN
    CREATE POLICY stream_versions_insert_org ON public.stream_versions
      FOR INSERT WITH CHECK (org_id = public.get_user_org_id());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stream_versions' AND policyname = 'stream_versions_update_org'
  ) THEN
    CREATE POLICY stream_versions_update_org ON public.stream_versions
      FOR UPDATE
      USING (org_id = public.get_user_org_id())
      WITH CHECK (org_id = public.get_user_org_id());
  END IF;
END;
$$;

-- mapping_runs: select, insert, update scoped by org_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'mapping_runs' AND policyname = 'mapping_runs_select_org'
  ) THEN
    CREATE POLICY mapping_runs_select_org ON public.mapping_runs
      FOR SELECT USING (org_id = public.get_user_org_id());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'mapping_runs' AND policyname = 'mapping_runs_insert_org'
  ) THEN
    CREATE POLICY mapping_runs_insert_org ON public.mapping_runs
      FOR INSERT WITH CHECK (org_id = public.get_user_org_id());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'mapping_runs' AND policyname = 'mapping_runs_update_org'
  ) THEN
    CREATE POLICY mapping_runs_update_org ON public.mapping_runs
      FOR UPDATE
      USING (org_id = public.get_user_org_id())
      WITH CHECK (org_id = public.get_user_org_id());
  END IF;
END;
$$;
