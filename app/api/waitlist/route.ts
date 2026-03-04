// Waitlist API endpoint to capture early access requests.
// Validates input, normalises email, and inserts into the waitlist table.
// Duplicate emails are treated as success (idempotent).

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

const MAX_EMAIL_LENGTH = 320;
const MAX_SOURCE_LENGTH = 64;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: unknown;
      source?: unknown;
    };

    const rawEmail =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const rawSource =
      typeof body.source === 'string' && body.source.length > 0
        ? body.source.slice(0, MAX_SOURCE_LENGTH)
        : 'landing_hero';

    if (
      !rawEmail ||
      !rawEmail.includes('@') ||
      rawEmail.length > MAX_EMAIL_LENGTH
    ) {
      return NextResponse.json(
        { error: 'A valid email is required.' },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from('waitlist')
      .insert({ email: rawEmail, source: rawSource });

    // 23505 = unique constraint violation → email already on the list
    if (error && error.code !== '23505') {
      return NextResponse.json(
        { error: 'Unable to save waitlist entry.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: 'Unexpected error.' },
      { status: 500 },
    );
  }
}
