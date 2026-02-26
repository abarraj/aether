// Streaming AI chat endpoint backed by Claude via the Vercel AI SDK.

import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { buildDataContext } from '@/lib/ai/data-context';
import { buildSystemPrompt } from '@/lib/ai/prompts';
import { logAuditEvent } from '@/lib/audit';

type ChatMessage = {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = (await request.json()) as { messages: ChatMessage[]; conversationId?: string };

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id, full_name')
      .eq('id', user.id)
      .maybeSingle<{ org_id: string | null; full_name: string | null }>();

    if (!profile?.org_id) {
      return new NextResponse('User has no organization.', { status: 400 });
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, industry')
      .eq('id', profile.org_id)
      .maybeSingle<{ id: string; name: string; industry: string | null }>();

    const orgName = org?.name ?? 'your organization';
    const industry = org?.industry ?? null;

    const dataContext = await buildDataContext(profile.org_id);
    const system = buildSystemPrompt({
      orgName,
      industry,
      dataContext,
    });

    const userMessages = body.messages.filter((message) => message.role === 'user');
    const lastUserMessage = userMessages[userMessages.length - 1];

    const conversationTitle =
      lastUserMessage?.content.slice(0, 80) || 'Aether AI COO conversation';

    let conversationId = body.conversationId ?? null;

    if (!conversationId) {
      const { data: createdConversation } = await supabase
        .from('ai_conversations')
        .insert({
          org_id: profile.org_id,
          user_id: user.id,
          title: conversationTitle,
        })
        .select('id')
        .maybeSingle<{ id: string }>();

      conversationId = createdConversation?.id ?? null;
    }

    if (conversationId && lastUserMessage) {
      await supabase.from('ai_messages').insert({
        org_id: profile.org_id,
        conversation_id: conversationId,
        role: 'user',
        content: lastUserMessage.content,
        metadata: {},
      });
    }

    if (lastUserMessage) {
      const ipHeader =
        (request.headers as Headers).get('x-forwarded-for') ??
        (request.headers as Headers).get('x-real-ip');
      const ipAddress = ipHeader ? ipHeader.split(',')[0]?.trim() ?? null : null;

      await logAuditEvent({
        orgId: profile.org_id,
        actorId: user.id,
        actorEmail: user.email ?? null,
        action: 'ai.query',
        targetType: 'ai',
        targetId: conversationId ?? undefined,
        description: `AI query from ${profile.full_name ?? user.email ?? 'User'}`,
        metadata: {
          question: lastUserMessage.content,
        },
        ipAddress,
      });
    }

    const result = await streamText({
      model: anthropic('claude-3-5-sonnet-20241022'),
      system,
      messages: body.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    });

    return result.toDataStreamResponse({
      async onFinal(final) {
        if (!conversationId) return;
        const text = final.text;
        await supabase.from('ai_messages').insert({
          org_id: profile.org_id,
          conversation_id: conversationId,
          role: 'assistant',
          content: text,
          metadata: {},
        });
      },
    });
  } catch (error) {
    return new NextResponse('AI handler error', { status: 500 });
  }
}

