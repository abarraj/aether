import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { claudeClient } from '@/lib/ai/claude';
import { buildDataContext } from '@/lib/ai/data-context';

type ProfileOrg = { org_id: string | null };

// Simple in-memory cache (resets on cold start, which is fine)
const cache = new Map<string, { text: string; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .maybeSingle<ProfileOrg>();
    if (!profile?.org_id) return NextResponse.json({ error: 'No org' }, { status: 400 });

    const orgId = profile.org_id;

    // Check cache
    const cached = cache.get(orgId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({ text: cached.text });
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('name, industry')
      .eq('id', orgId)
      .maybeSingle();

    const dataContext = await buildDataContext(orgId);

    // If no meaningful data exists, return a default message
    if (!dataContext || dataContext.length < 100) {
      return NextResponse.json({ text: null });
    }

    const completion = await claudeClient.messages.create({
      model: 'claude-3-5-sonnet-20241022',
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
          content: [
            {
              type: 'text',
              text: `Here is the full operational context:\n\n${dataContext}\n\nWrite the morning briefing.`,
            },
          ],
        },
      ],
    });

    const text = completion.content
      .filter((part) => part.type === 'text')
      .map((part) => ('text' in part ? part.text : ''))
      .join('')
      .trim();

    // Cache it
    cache.set(orgId, { text, timestamp: Date.now() });

    return NextResponse.json({ text });
  } catch (err) {
    console.error('AI Spotlight error:', err);
    return NextResponse.json({ text: null });
  }
}
