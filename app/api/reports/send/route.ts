import { NextResponse } from 'next/server';

import { getOrgContext } from '@/lib/auth/org-context';
import {
  generateWeeklyReport,
  buildReportHtml,
} from '@/lib/reports/weekly-report';
import { sendEmail } from '@/lib/email';

export async function POST() {
  try {
    const ctx = await getOrgContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await ctx.supabase
      .from('profiles')
      .select('email')
      .eq('id', ctx.userId)
      .maybeSingle<{ email: string | null }>();

    const email = profile?.email;
    if (!email)
      return NextResponse.json({ error: 'No email' }, { status: 400 });

    const reportData = await generateWeeklyReport(ctx.orgId);
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
