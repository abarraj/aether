-- AI conversations and messages backing the Aether assistant experience.

-- Conversations represent a threaded session between a user and the AI within an org.
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Messages capture the turn-by-turn content within a conversation.
CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations (id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index to quickly load messages for a given conversation.
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_id
  ON public.ai_messages (conversation_id);

