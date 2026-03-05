// Streaming AI chat endpoint backed by Claude via the Vercel AI SDK.
// Supports persistent multi-turn conversations:
//   - Accepts optional conversationId to continue an existing conversation.
//   - Creates a new conversation if none provided.
//   - Persists BOTH user and assistant messages to ai_messages.
//   - Returns conversationId via x-conversation-id response header.

import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { NextResponse } from 'next/server';

import { getOrgContext } from '@/lib/auth/org-context';
import { buildDataContext } from '@/lib/ai/data-context';
import { buildSystemPrompt } from '@/lib/ai/prompts';
import { logAuditEvent } from '@/lib/audit';
import { assertAiCreditsAvailable } from '@/lib/billing/queries';

export async function POST(request: Request) {
  try {
    const ctx = await getOrgContext();
    if (!ctx) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // ── Check AI credit limit ────────────────────────────────────────
    const hasCredits = await assertAiCreditsAvailable(ctx.orgId);
    if (!hasCredits) {
      return NextResponse.json(
        { error: 'AI credit limit reached for your current plan.', upgrade: true },
        { status: 402 },
      );
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

    // ── Resolve or create conversation ──────────────────────────────
    let conversationId: string | null = null;

    try {
      const incomingConversationId: string | undefined = body.conversationId;

      if (incomingConversationId) {
        // Validate the conversation belongs to this user+org
        const { data: existing } = await ctx.supabase
          .from('ai_conversations')
          .select('id')
          .eq('id', incomingConversationId)
          .eq('org_id', ctx.orgId)
          .eq('user_id', ctx.userId)
          .maybeSingle<{ id: string }>();

        if (existing) {
          conversationId = existing.id;
        }
      }

      if (!conversationId && lastUserMessage) {
        // Create a new conversation
        const conversationTitle = lastUserMessage.content.slice(0, 80);
        const { data: created } = await ctx.supabase
          .from('ai_conversations')
          .insert({
            org_id: ctx.orgId,
            user_id: ctx.userId,
            title: conversationTitle,
          })
          .select('id')
          .maybeSingle<{ id: string }>();

        if (created) {
          conversationId = created.id;
        }
      }

      // Save user message
      if (conversationId && lastUserMessage) {
        await ctx.supabase
          .from('ai_messages')
          .insert({
            org_id: ctx.orgId,
            conversation_id: conversationId,
            role: 'user',
            content: lastUserMessage.content,
            metadata: {},
          })
          .then(
            () => undefined,
            () => undefined,
          );
      }

      // Audit log
      if (lastUserMessage) {
        const ipHeader =
          request.headers.get('x-forwarded-for') ??
          request.headers.get('x-real-ip');
        const ipAddress = ipHeader
          ? (ipHeader.split(',')[0]?.trim() ?? null)
          : null;
        await logAuditEvent({
          orgId: ctx.orgId,
          actorId: ctx.userId,
          actorEmail: profile?.email ?? null,
          action: 'ai.query',
          targetType: 'ai',
          targetId: conversationId ?? undefined,
          description: `AI query from ${profile?.full_name ?? profile?.email ?? 'User'}`,
          metadata: { question: lastUserMessage.content },
          ipAddress,
        }).catch(() => undefined);
      }
    } catch {
      // Non-blocking: logging failures should never kill the chat
    }

    // ── Stream the response ─────────────────────────────────────────
    // Capture conversationId in a local const for the onFinish closure.
    const convId = conversationId;

    const MODEL_ID = 'claude-sonnet-4-5-20250929';

    const result = streamText({
      model: anthropic(MODEL_ID),
      system,
      messages,
      async onFinish({ text, usage: tokenUsage }) {
        // ── Log AI usage event (1 credit) ──────────────────────────
        try {
          await ctx.supabase.from('ai_usage_events').insert({
            org_id: ctx.orgId,
            user_id: ctx.userId,
            route: 'chat',
            model: MODEL_ID,
            tokens_in: tokenUsage?.promptTokens ?? 0,
            tokens_out: tokenUsage?.completionTokens ?? 0,
            success: true,
          });
        } catch {
          // Non-blocking: metering failure should never kill the chat
        }

        // Persist the assistant's full response
        if (convId && text) {
          try {
            await ctx.supabase.from('ai_messages').insert({
              org_id: ctx.orgId,
              conversation_id: convId,
              role: 'assistant',
              content: text,
              metadata: {},
            });

            // Update conversation timestamp so it sorts to top of history
            await ctx.supabase
              .from('ai_conversations')
              .update({ updated_at: new Date().toISOString() })
              .eq('id', convId)
              .eq('org_id', ctx.orgId);
          } catch {
            // Non-blocking
          }
        }
      },
    });

    const responseHeaders: Record<string, string> = {};
    if (convId) {
      responseHeaders['x-conversation-id'] = convId;
    }

    return (
      result as {
        toDataStreamResponse: (opts?: {
          headers?: Record<string, string>;
        }) => Response;
      }
    ).toDataStreamResponse({ headers: responseHeaders });
  } catch (error) {
    console.error('CHAT_ERROR:', error);
    return new NextResponse('AI handler error', { status: 500 });
  }
}
