import { NextRequest, NextResponse } from 'next/server';

import { getStripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Service role required: Stripe webhooks carry no Supabase session.
  // Auth is provided by the Stripe signature verification above.
  const supabase = createAdminClient({ caller: 'billing-webhook' });

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as {
      metadata?: { org_id?: string; plan?: string };
      client_reference_id?: string | null;
      customer?: string | null;
      subscription?: string | null;
    };
    const orgId =
      session.metadata?.org_id ?? session.client_reference_id ?? null;
    const plan = session.metadata?.plan;
    const customerId = session.customer;
    const subscriptionId = session.subscription;

    if (orgId && plan) {
      await supabase
        .from('organizations')
        .update({
          plan,
          stripe_customer_id: customerId ?? null,
          stripe_subscription_id: subscriptionId ?? null,
        })
        .eq('id', orgId);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as { customer?: string };
    const customerId = subscription.customer;

    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();

    if (org) {
      await supabase
        .from('organizations')
        .update({ plan: 'starter', stripe_subscription_id: null })
        .eq('id', org.id);
    }
  }

  return NextResponse.json({ received: true });
}
