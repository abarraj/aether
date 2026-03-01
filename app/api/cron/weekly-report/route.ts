import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  generateWeeklyReport,
  buildReportHtml,
} from '@/lib/reports/weekly-report';
import { sendEmail } from '@/lib/email';

type ProfileRow = {
  id: string;
  email: string | null;
  org_id: string | null;
  notification_preferences: {
    email_weekly_summary?: boolean;
  } | null;
};

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, org_id, notification_preferences')
      .returns<ProfileRow[]>();

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    const eligible = profiles.filter((p) => {
      if (!p.org_id || !p.email) return false;
      const prefs = p.notification_preferences;
      return prefs?.email_weekly_summary !== false;
    });

    const orgUsers = new Map<string, string[]>();
    for (const p of eligible) {
      const emails = orgUsers.get(p.org_id!) ?? [];
      emails.push(p.email!);
      orgUsers.set(p.org_id!, emails);
    }

    let totalSent = 0;

    for (const [orgId, emails] of orgUsers) {
      try {
        const reportData = await generateWeeklyReport(orgId);
        if (!reportData || reportData.revenue.current === 0) continue;

        const html = buildReportHtml(reportData);
        const subject = `Aether Weekly: ${reportData.weekLabel} — ${reportData.orgName}`;

        for (const email of emails) {
          const sent = await sendEmail({ to: email, subject, html });
          if (sent) totalSent++;
        }
      } catch (err) {
        console.error(`Weekly report failed for org ${orgId}:`, err);
      }
    }

    return NextResponse.json({ sent: totalSent });
  } catch (err) {
    console.error('Weekly report cron error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
