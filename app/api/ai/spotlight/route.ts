import { NextResponse } from 'next/server';

import { getOrgContext } from '@/lib/auth/org-context';
import { claude } from '@/lib/ai/claude';
import { buildDataContext } from '@/lib/ai/data-context';

export async function GET() {
  try {
    const ctx = await getOrgContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
      model: 'claude-sonnet-4-20250514',
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

    return NextResponse.json({ text });
  } catch (err) {
    console.error('AI Spotlight error:', err);
    return NextResponse.json({ text: null });
  }
}
