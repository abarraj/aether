import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { generateRecommendations } from '@/lib/ai/recommendations';

type OrgRow = {
  id: string;
  onboarding_completed: boolean;
};

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();

    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, onboarding_completed')
      .eq('onboarding_completed', true)
      .returns<OrgRow[]>();

    if (!orgs || orgs.length === 0) {
      return NextResponse.json({ generated: 0 });
    }

    let totalAlerts = 0;

    for (const org of orgs) {
      const recommendations = await generateRecommendations(org.id);
      if (recommendations.length === 0) continue;

      const scoped = recommendations.map((rec) => ({
        ...rec,
        org_id: org.id,
      }));

      const { error } = await supabase.from('alerts').insert(scoped);
      if (!error) {
        totalAlerts += scoped.length;
      }
    }

    return NextResponse.json({ generated: totalAlerts });
  } catch {
    return NextResponse.json({ error: 'Failed to generate alerts.' }, { status: 500 });
  }
}
