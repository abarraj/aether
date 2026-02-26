-- Alerts table representing anomalies, insights, and notifications for operators.

-- Each alert is scoped to an organization and can be read or dismissed per workspace.
CREATE TABLE IF NOT EXISTS public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id),
  type text NOT NULL,
  severity text NOT NULL,
  title text NOT NULL,
  description text,
  data jsonb DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  is_dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

