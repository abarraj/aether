import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const body = await req.json();
  const token = String(body.token ?? '');
  if (!token) {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('preview_invite', { _raw_token: token });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
