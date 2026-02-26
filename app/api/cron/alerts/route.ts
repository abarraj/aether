// Cron route to generate proactive recommendations for all active organizations.

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { generateRecommendations } from '@/lib/ai/recommendations';

type OrgRow = {
  id: string;
  onboarding_completed: boolean;
};

export async function GET() {
  try {
    const supabase = await createClient();

    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, onboarding_completed')
      .returns<OrgRow[]>();

    if (!orgs || orgs.length === 0) {
      return NextResponse.json({ generated: 0 });
    }

    let totalAlerts = 0;

    for (const org of orgs) {
      if (!org.onboarding_completed) continue;

      const recommendations = await generateRecommendations(org.id);
      if (recommendations.length === 0) continue;

      const { error } = await supabase.from('alerts').insert(recommendations);
      if (!error) {
        totalAlerts += recommendations.length;
      }
    }

    return NextResponse.json({ generated: totalAlerts });
  } catch {
    return NextResponse.json({ error: 'Failed to generate alerts.' }, { status: 500 });
  }
}

