-- Extend invites table for secure token-based invite flow with RPCs and RLS.

-- 1. Token and metadata columns.
ALTER TABLE public.invites
  ADD COLUMN IF NOT EXISTS token_hash  text,
  ADD COLUMN IF NOT EXISTS invited_by  uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expires_at  timestamptz;

-- 2. Fast lookup by token hash.
CREATE INDEX IF NOT EXISTS idx_invites_token_hash
  ON public.invites (token_hash) WHERE token_hash IS NOT NULL;

-- 3. Replace full unique constraint with partial (one pending invite per email per org).
ALTER TABLE public.invites DROP CONSTRAINT IF EXISTS invites_org_id_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invites_org_email_pending
  ON public.invites (org_id, email) WHERE accepted_at IS NULL;

-- 4. pgcrypto for SHA-256 hashing inside SQL functions.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 5. Row-Level Security.
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY invites_select ON public.invites FOR SELECT
  USING (org_id IN (
    SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid()
  ));

CREATE POLICY invites_insert ON public.invites FOR INSERT
  WITH CHECK (org_id IN (
    SELECT p.org_id FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('owner', 'admin')
  ));

CREATE POLICY invites_update ON public.invites FOR UPDATE
  USING (org_id IN (
    SELECT p.org_id FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('owner', 'admin')
  ));

CREATE POLICY invites_delete ON public.invites FOR DELETE
  USING (org_id IN (
    SELECT p.org_id FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('owner', 'admin')
  ));

-- 6. preview_invite — no auth required, returns minimal info.
CREATE OR REPLACE FUNCTION public.preview_invite(_raw_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hash   text;
  _result json;
BEGIN
  _hash := encode(digest(_raw_token, 'sha256'), 'hex');

  SELECT json_build_object(
    'org_name',   o.name,
    'role',       i.role,
    'email',      i.email,
    'expires_at', i.expires_at,
    'expired',    (i.expires_at IS NOT NULL AND i.expires_at < now()),
    'accepted',   (i.accepted_at IS NOT NULL)
  ) INTO _result
  FROM public.invites i
  JOIN public.organizations o ON o.id = i.org_id
  WHERE i.token_hash = _hash;

  IF _result IS NULL THEN
    RAISE EXCEPTION 'Invite not found or invalid token';
  END IF;

  RETURN _result;
END;
$$;

-- 7. accept_invite — auth required, email-binding enforced.
CREATE OR REPLACE FUNCTION public.accept_invite(_raw_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hash       text;
  _invite     record;
  _user_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  _hash := encode(digest(_raw_token, 'sha256'), 'hex');

  SELECT i.id, i.org_id, i.email, i.role, i.expires_at, i.accepted_at
  INTO _invite
  FROM public.invites i
  WHERE i.token_hash = _hash;

  IF _invite IS NULL THEN
    RAISE EXCEPTION 'Invite not found or invalid token';
  END IF;

  IF _invite.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invite has already been accepted';
  END IF;

  IF _invite.expires_at IS NOT NULL AND _invite.expires_at < now() THEN
    RAISE EXCEPTION 'Invite has expired';
  END IF;

  SELECT email INTO _user_email FROM auth.users WHERE id = auth.uid();

  IF lower(_user_email) <> lower(_invite.email) THEN
    RAISE EXCEPTION 'Email mismatch: this invite was sent to a different address';
  END IF;

  UPDATE public.profiles
  SET org_id     = _invite.org_id,
      role       = _invite.role,
      updated_at = now()
  WHERE id = auth.uid();

  UPDATE public.invites
  SET accepted_at = now(),
      status      = 'accepted'
  WHERE id = _invite.id;

  RETURN json_build_object('ok', true, 'org_id', _invite.org_id, 'role', _invite.role);
END;
$$;

-- 8. Grant execute to appropriate roles.
GRANT EXECUTE ON FUNCTION public.preview_invite(text) TO anon;
GRANT EXECUTE ON FUNCTION public.preview_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invite(text) TO authenticated;
