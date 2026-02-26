-- Notification preferences on profiles.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notify_daily_summary boolean NOT NULL DEFAULT true;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notify_critical_alerts boolean NOT NULL DEFAULT true;

