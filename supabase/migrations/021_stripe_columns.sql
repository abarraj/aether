-- Ensure Stripe columns exist on organizations (idempotent).

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
