// API route: list AI conversations for the current user.
// GET: returns conversations ordered by most-recently-updated.

import { NextResponse } from 'next/server';

import { getOrgContext } from '@/lib/auth/org-context';

interface ConversationRow {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageCountRow {
  conversation_id: string;
  count: number;
}

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { data: conversations, error } = await ctx.supabase
    .from('ai_conversations')
    .select('id, title, created_at, updated_at')
    .eq('org_id', ctx.orgId)
    .eq('user_id', ctx.userId)
    .order('updated_at', { ascending: false })
    .limit(50)
    .returns<ConversationRow[]>();

  if (error) {
    return NextResponse.json(
      { error: 'Failed to load conversations.' },
      { status: 500 },
    );
  }

  if (!conversations || conversations.length === 0) {
    return NextResponse.json({ conversations: [] });
  }

  // Fetch message counts for each conversation.
  // We use a single query with an IN filter for efficiency.
  const ids = conversations.map((c) => c.id);

  // Supabase doesn't support GROUP BY easily via PostgREST, so we do a
  // lightweight count per conversation. For ≤50 conversations this is fine.
  const countPromises = ids.map(async (id) => {
    const { count } = await ctx.supabase
      .from('ai_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', id)
      .eq('org_id', ctx.orgId);
    return { conversation_id: id, count: count ?? 0 } as MessageCountRow;
  });

  const counts = await Promise.all(countPromises);
  const countMap = new Map(counts.map((c) => [c.conversation_id, c.count]));

  const result = conversations.map((c) => ({
    id: c.id,
    title: c.title,
    updatedAt: c.updated_at,
    createdAt: c.created_at,
    messageCount: countMap.get(c.id) ?? 0,
  }));

  return NextResponse.json({ conversations: result });
}
