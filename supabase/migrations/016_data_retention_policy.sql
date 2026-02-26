-- Simple text-based data retention policy on organizations.

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS data_retention_policy text NOT NULL DEFAULT 'forever';

