// Waitlist API endpoint to capture early access requests.

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { email, source } = (await request.json()) as {
      email?: string;
      source?: string;
    };

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
    }

    const normalizedSource =
      typeof source === 'string' && source.length > 0 ? source : 'landing_hero';

    const { error } = await supabase
      .from('waitlist')
      .insert({ email: email.toLowerCase(), source: normalizedSource });

    if (error && error.code !== '23505') {
      return NextResponse.json({ error: 'Unable to save waitlist entry.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 });
  }
}

