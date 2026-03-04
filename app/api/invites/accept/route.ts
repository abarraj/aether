import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const token = String(body.token ?? '');
  if (!token) {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('accept_invite', { _raw_token: token });

  if (error) {
    const msg = error.message;
    const status =
      msg.includes('expired') || msg.includes('mismatch') || msg.includes('accepted')
        ? 403
        : 400;
    return NextResponse.json({ error: msg }, { status });
  }

  return NextResponse.json(data);
}
