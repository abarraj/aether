import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import {
  generateWeeklyReport,
  buildReportHtml,
} from '@/lib/reports/weekly-report';

type ProfileOrg = { org_id: string | null };

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return new NextResponse('Unauthorized', { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .maybeSingle<ProfileOrg>();
    if (!profile?.org_id) return new NextResponse('No org', { status: 400 });

    const reportData = await generateWeeklyReport(profile.org_id);
    if (!reportData)
      return new NextResponse('No data for report', { status: 404 });

    const html = buildReportHtml(reportData);

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (err) {
    console.error('Report preview error:', err);
    return new NextResponse('Failed', { status: 500 });
  }
}
