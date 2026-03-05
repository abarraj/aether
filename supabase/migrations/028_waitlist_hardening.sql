-- 028_waitlist_hardening.sql
-- Enable RLS on the waitlist table and add an anonymous INSERT policy.
-- No SELECT/UPDATE/DELETE policies → data is write-only from the public API.

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (waitlist signup requires no authentication).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'waitlist'
      AND policyname = 'waitlist_anon_insert'
  ) THEN
    CREATE POLICY waitlist_anon_insert
      ON public.waitlist FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;
