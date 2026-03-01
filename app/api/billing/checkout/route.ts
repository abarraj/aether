import { NextRequest, NextResponse } from 'next/server';

import { stripe } from '@/lib/stripe';
import { createClient } from '@/lib/supabase/server';

const PRICE_MAP: Record<string, string | undefined> = {
  starter: process.env.STRIPE_STARTER_PRICE_ID,
  growth: process.env.STRIPE_GROWTH_PRICE_ID,
};

export async function POST(request: NextRequest) {
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
      .maybeSingle();
    if (!profile?.org_id)
      return NextResponse.json({ error: 'No org' }, { status: 400 });

    const body = (await request.json()) as { plan?: string };
    const plan = body.plan as string;
    const priceId = PRICE_MAP[plan];
    if (!priceId)
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
      'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/dashboard/settings/billing?success=true`,
      cancel_url: `${baseUrl}/dashboard/settings/billing?canceled=true`,
      client_reference_id: profile.org_id,
      customer_email: user.email ?? undefined,
      metadata: {
        org_id: profile.org_id,
        user_id: user.id,
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
