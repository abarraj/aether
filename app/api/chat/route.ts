// Streaming AI chat endpoint backed by Claude via the Vercel AI SDK.

import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { buildDataContext } from '@/lib/ai/data-context';
import { buildSystemPrompt } from '@/lib/ai/prompts';
import { logAuditEvent } from '@/lib/audit';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();

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
    const system = buildSystemPrompt({ orgName, industry, dataContext });

    const rawMessages: Array<{
      role: string;
      content?: string;
      parts?: Array<{ type: string; text?: string }>;
    }> = body.messages ?? [];

    const messages = rawMessages
      .map((m) => {
        let content = '';
        if (typeof m.content === 'string' && m.content.length > 0) {
          content = m.content;
        } else if (Array.isArray(m.parts)) {
          content = m.parts
            .filter((p) => p.type === 'text' && p.text)
            .map((p) => p.text!)
            .join('\n');
        }
        return { role: m.role as 'user' | 'assistant', content };
      })
      .filter((m) => m.content.length > 0);

    const userMessages = messages.filter((m) => m.role === 'user');
    const lastUserMessage = userMessages[userMessages.length - 1];

    try {
      if (lastUserMessage) {
        const conversationTitle = lastUserMessage.content.slice(0, 80);
        const { data: created } = await supabase
          .from('ai_conversations')
          .insert({ org_id: profile.org_id, user_id: user.id, title: conversationTitle })
          .select('id')
          .maybeSingle<{ id: string }>();

        if (created) {
          await supabase
            .from('ai_messages')
            .insert({
              conversation_id: created.id,
              role: 'user',
              content: lastUserMessage.content,
              metadata: {},
            })
            .then(() => undefined, () => undefined);
        }

        const ipHeader =
          request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip');
        const ipAddress = ipHeader ? ipHeader.split(',')[0]?.trim() ?? null : null;
        await logAuditEvent({
          orgId: profile.org_id,
          actorId: user.id,
          actorEmail: user.email ?? null,
          action: 'ai.query',
          targetType: 'ai',
          targetId: created?.id ?? undefined,
          description: `AI query from ${profile.full_name ?? user.email ?? 'User'}`,
          metadata: { question: lastUserMessage.content },
          ipAddress,
        }).catch(() => undefined);
      }
    } catch {
      // Non-blocking: logging failures should never kill the chat
    }

    const result = streamText({
      model: anthropic('claude-sonnet-4-5-20250929'),
      system,
      messages,
    });

    // Try the methods that exist in this version of the SDK.
    // In ai v6, the correct method for useChat consumption is
    // toUIMessageStreamResponse (preferred) or toTextStreamResponse.
    // @ts-ignore — method availability varies by exact patch version
    if (typeof result.toUIMessageStreamResponse === 'function') {
      // @ts-ignore
      return result.toUIMessageStreamResponse();
    }

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('CHAT_ERROR:', error);
    return new NextResponse('AI handler error', { status: 500 });
  }
}
