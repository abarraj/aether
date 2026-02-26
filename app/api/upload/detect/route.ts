// Runs ontology detection on parsed spreadsheet data (no file upload). Used by upload flow.

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { detectOntology } from '@/lib/ai/ontology-detector';

type Body = {
  headers: string[];
  rows: Record<string, unknown>[];
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .maybeSingle<{ org_id: string | null }>();

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'No organization' }, { status: 400 });
    }

    const body = (await request.json()) as Body;
    const headers = Array.isArray(body.headers) ? body.headers : [];
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (headers.length === 0 || rows.length === 0) {
      return NextResponse.json({ error: 'headers and rows required' }, { status: 400 });
    }

    const detection = await detectOntology(headers, rows, profile.org_id);
    return NextResponse.json({ detection });
  } catch {
    return NextResponse.json({ error: 'Detection failed' }, { status: 500 });
  }
}
