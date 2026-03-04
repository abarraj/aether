// Streaming AI chat endpoint backed by Claude via the Vercel AI SDK.

import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { NextResponse } from 'next/server';

import { getOrgContext } from '@/lib/auth/org-context';
import { buildDataContext } from '@/lib/ai/data-context';
import { buildSystemPrompt } from '@/lib/ai/prompts';
import { logAuditEvent } from '@/lib/audit';

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    if (!ctx) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { data: profile } = await ctx.supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', ctx.userId)
      .maybeSingle<{ full_name: string | null; email: string | null }>();

    const body = await request.json();

    const { data: org } = await ctx.supabase
      .from('organizations')
      .select('id, name, industry')
      .eq('id', ctx.orgId)
      .maybeSingle<{ id: string; name: string; industry: string | null }>();

    const orgName = org?.name ?? 'your organization';
    const industry = org?.industry ?? null;

    const dataContext = await buildDataContext(ctx.orgId);
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
        const { data: created } = await ctx.supabase
          .from('ai_conversations')
          .insert({ org_id: ctx.orgId, user_id: ctx.userId, title: conversationTitle })
          .select('id')
          .maybeSingle<{ id: string }>();

        if (created) {
          await ctx.supabase
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
          orgId: ctx.orgId,
          actorId: ctx.userId,
          actorEmail: profile?.email ?? null,
          action: 'ai.query',
          targetType: 'ai',
          targetId: created?.id ?? undefined,
          description: `AI query from ${profile?.full_name ?? profile?.email ?? 'User'}`,
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

    return (result as { toDataStreamResponse: () => Response }).toDataStreamResponse();
  } catch (error) {
    console.error('CHAT_ERROR:', error);
    return new NextResponse('AI handler error', { status: 500 });
  }
}
