-- 027_ai_assistant_hardening.sql
-- Indices and policies to support persistent multi-turn AI conversations.

-- Fast conversation list for a user within an org (ordered by most recent).
CREATE INDEX IF NOT EXISTS idx_ai_conversations_org_user
  ON public.ai_conversations (org_id, user_id, updated_at DESC);

-- Fast message loading for a conversation (chronological order).
CREATE INDEX IF NOT EXISTS idx_ai_messages_org_conversation
  ON public.ai_messages (org_id, conversation_id, created_at ASC);

-- DELETE policy on ai_conversations (org-scoped).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_conversations'
      AND policyname = 'ai_conversations_delete_org'
  ) THEN
    CREATE POLICY ai_conversations_delete_org
      ON public.ai_conversations FOR DELETE
      USING (org_id = public.get_user_org_id());
  END IF;
END $$;

-- DELETE policy on ai_messages (org-scoped).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_messages'
      AND policyname = 'ai_messages_delete_org'
  ) THEN
    CREATE POLICY ai_messages_delete_org
      ON public.ai_messages FOR DELETE
      USING (org_id = public.get_user_org_id());
  END IF;
END $$;
