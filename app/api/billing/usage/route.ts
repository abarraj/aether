// Server-side billing usage endpoint.
// Returns all usage metrics + plan limits for the billing page.
// Replaces ad-hoc client-side counting with a single authenticated query.

import { NextResponse } from 'next/server';

import { getOrgContext } from '@/lib/auth/org-context';
import { getUsageSummary } from '@/lib/billing/queries';

export async function GET() {
  try {
    const ctx = await getOrgContext();
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const summary = await getUsageSummary(ctx.orgId);
    return NextResponse.json(summary);
  } catch (err) {
    console.error('Billing usage error:', err);
    return NextResponse.json(
      { error: 'Failed to load usage data' },
      { status: 500 },
    );
  }
}
