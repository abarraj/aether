-- Store AI detection results directly on the upload record.
-- This makes detection the single source of truth for stream classification
-- and metric column identification.

ALTER TABLE public.uploads
  ADD COLUMN IF NOT EXISTS detection            jsonb,
  ADD COLUMN IF NOT EXISTS detection_confidence  numeric,
  ADD COLUMN IF NOT EXISTS detection_stream_type text,
  ADD COLUMN IF NOT EXISTS detection_version     integer DEFAULT 1;

-- No new RLS needed — uploads already scoped by org_id via existing policies.
COMMENT ON COLUMN public.uploads.detection IS 'Full AI ontology detection payload (entity types, metrics, relationships)';
COMMENT ON COLUMN public.uploads.detection_confidence IS 'AI confidence score 0-1';
COMMENT ON COLUMN public.uploads.detection_stream_type IS 'Classified stream type: transactions_sales, staff_roster, client_roster, inventory, schedule, unknown';
COMMENT ON COLUMN public.uploads.detection_version IS 'Detection schema version for forward-compat';
