// API routes for a single AI conversation.
// GET:    load all messages for a conversation.
// DELETE: delete a conversation and its messages.

import { NextRequest, NextResponse } from 'next/server';

import { getOrgContext } from '@/lib/auth/org-context';

interface MessageRow {
  id: string;
  role: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { id } = await params;

  // Verify conversation belongs to this user+org
  const { data: conversation } = await ctx.supabase
    .from('ai_conversations')
    .select('id, title, created_at, updated_at')
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .eq('user_id', ctx.userId)
    .maybeSingle<{
      id: string;
      title: string | null;
      created_at: string;
      updated_at: string;
    }>();

  if (!conversation) {
    return NextResponse.json(
      { error: 'Conversation not found.' },
      { status: 404 },
    );
  }

  // Load messages in chronological order
  const { data: messages, error } = await ctx.supabase
    .from('ai_messages')
    .select('id, role, content, metadata, created_at')
    .eq('conversation_id', id)
    .eq('org_id', ctx.orgId)
    .order('created_at', { ascending: true })
    .limit(200)
    .returns<MessageRow[]>();

  if (error) {
    return NextResponse.json(
      { error: 'Failed to load messages.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    conversation: {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
    },
    messages: (messages ?? []).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.created_at,
    })),
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { id } = await params;

  // Verify ownership before deleting
  const { data: conversation } = await ctx.supabase
    .from('ai_conversations')
    .select('id')
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .eq('user_id', ctx.userId)
    .maybeSingle<{ id: string }>();

  if (!conversation) {
    return NextResponse.json(
      { error: 'Conversation not found.' },
      { status: 404 },
    );
  }

  // Delete messages first (cascade should handle it, but be explicit)
  await ctx.supabase
    .from('ai_messages')
    .delete()
    .eq('conversation_id', id)
    .eq('org_id', ctx.orgId);

  // Delete the conversation
  const { error } = await ctx.supabase
    .from('ai_conversations')
    .delete()
    .eq('id', id)
    .eq('org_id', ctx.orgId);

  if (error) {
    return NextResponse.json(
      { error: 'Failed to delete conversation.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
