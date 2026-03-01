import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import {
  generateWeeklyReport,
  buildReportHtml,
} from '@/lib/reports/weekly-report';
import { sendEmail } from '@/lib/email';

type ProfileOrg = { org_id: string | null; email: string | null };

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id, email')
      .eq('id', user.id)
      .maybeSingle<ProfileOrg>();
    if (!profile?.org_id)
      return NextResponse.json({ error: 'No org' }, { status: 400 });

    const email = profile.email || user.email;
    if (!email)
      return NextResponse.json({ error: 'No email' }, { status: 400 });

    const reportData = await generateWeeklyReport(profile.org_id);
    if (!reportData)
      return NextResponse.json({ error: 'No data' }, { status: 404 });

    const html = buildReportHtml(reportData);
    const subject = `Aether Weekly: ${reportData.weekLabel} — ${reportData.orgName}`;

    const sent = await sendEmail({ to: email, subject, html });
    if (!sent)
      return NextResponse.json({ error: 'Email failed' }, { status: 500 });

    return NextResponse.json({ sent: true });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
