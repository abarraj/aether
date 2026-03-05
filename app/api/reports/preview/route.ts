import { NextResponse } from 'next/server';

import { getOrgContext } from '@/lib/auth/org-context';
import {
  generateWeeklyReport,
  buildReportHtml,
} from '@/lib/reports/weekly-report';

export async function GET() {
  try {
    const ctx = await getOrgContext();
    if (!ctx) return new NextResponse('Unauthorized', { status: 401 });

    const reportData = await generateWeeklyReport(ctx.orgId);
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
