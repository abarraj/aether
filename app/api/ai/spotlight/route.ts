import { NextResponse } from 'next/server';

import { getOrgContext } from '@/lib/auth/org-context';
import { claude } from '@/lib/ai/claude';
import { buildDataContext } from '@/lib/ai/data-context';
import { assertAiCreditsAvailable } from '@/lib/billing/queries';

const MODEL_ID = 'claude-sonnet-4-20250514';

export async function GET() {
  try {
    const ctx = await getOrgContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // ── Check AI credit limit ────────────────────────────────────
    const hasCredits = await assertAiCreditsAvailable(ctx.orgId);
    if (!hasCredits) {
      return NextResponse.json({ text: null, limitReached: true });
    }

    const { data: org } = await ctx.supabase
      .from('organizations')
      .select('name, industry')
      .eq('id', ctx.orgId)
      .maybeSingle();

    const dataContext = await buildDataContext(ctx.orgId);

    if (!dataContext || dataContext.length < 100) {
      return NextResponse.json({ text: null });
    }

    const completion = await claude().messages.create({
      model: MODEL_ID,
      max_tokens: 200,
      system:
        `You are the AI COO for ${org?.name ?? 'this business'}, a ${org?.industry ?? 'business'}. ` +
        'Write a 2-3 sentence morning briefing for the operator. Be specific with numbers. ' +
        'Lead with the most actionable insight. Mention specific entities by name. ' +
        'If there are active recovery targets, mention progress. ' +
        'Do NOT use bullet points or headers. Write as one natural paragraph. ' +
        'Include one markdown link to the most relevant page: ' +
        '[View Performance](/dashboard/performance) or [View Alerts](/dashboard/alerts) or ' +
        '[entity name](/dashboard/performance?entity=ENTITY_NAME).',
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: `Here is the full operational context:\n\n${dataContext}\n\nWrite the morning briefing.` }],
        },
      ],
    });

    const text = completion.content
      .filter((part) => part.type === 'text')
      .map((part) => ('text' in part ? part.text : ''))
      .join('')
      .trim();

    // ── Log AI usage event (1 credit) ────────────────────────────
    try {
      const tokensIn = completion.usage?.input_tokens ?? 0;
      const tokensOut = completion.usage?.output_tokens ?? 0;

      await ctx.supabase.from('ai_usage_events').insert({
        org_id: ctx.orgId,
        user_id: ctx.userId,
        route: 'spotlight',
        model: MODEL_ID,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        success: true,
      });
    } catch {
      // Non-blocking: metering failure should never kill spotlight
    }

    return NextResponse.json({ text });
  } catch (err) {
    console.error('AI Spotlight error:', err);
    return NextResponse.json({ text: null });
  }
}
