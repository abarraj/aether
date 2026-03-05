import { NextRequest, NextResponse } from 'next/server';

import { getStripe } from '@/lib/stripe';
import { requirePermission } from '@/lib/auth/org-context';

const PRICE_MAP: Record<string, string | undefined> = {
  starter: process.env.STRIPE_STARTER_PRICE_ID,
  growth: process.env.STRIPE_GROWTH_PRICE_ID,
};

export async function POST(request: NextRequest) {
  try {
    const result = await requirePermission('manage_billing');
    if (result instanceof NextResponse) return result;
    const ctx = result;

    const { data: { user } } = await ctx.supabase.auth.getUser();

    const body = (await request.json()) as { plan?: string };
    const plan = body.plan as string;
    const priceId = PRICE_MAP[plan];
    if (!priceId)
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
      'http://localhost:3000';

    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/dashboard/settings/billing?success=true`,
      cancel_url: `${baseUrl}/dashboard/settings/billing?canceled=true`,
      client_reference_id: ctx.orgId,
      customer_email: user?.email ?? undefined,
      metadata: {
        org_id: ctx.orgId,
        user_id: ctx.userId,
        plan,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    return NextResponse.json(
      { error: 'Failed to create checkout' },
      { status: 500 },
    );
  }
}
