-- Core organizations table for multi-tenant Aether workspaces.

-- Ensure UUID generation is available for default primary keys.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Organizations represent a single business or group of locations.
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  industry text,
  timezone text NOT NULL DEFAULT 'UTC',
  currency text NOT NULL DEFAULT 'USD',
  logo_url text,
  plan text NOT NULL DEFAULT 'starter',
  stripe_customer_id text,
  stripe_subscription_id text,
  onboarding_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

