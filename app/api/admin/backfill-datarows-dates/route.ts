// Temporary admin-only backfill for data_rows with null dates.
// Set ADMIN_KEY in Vercel env vars (Settings → Environment Variables) and pass
// it via x-admin-key header when calling this endpoint. Not linked in the UI.

import { NextRequest, NextResponse } from 'next/server';
import { subDays } from 'date-fns';

import { extractDateFromRow } from '@/lib/data/date-mapping';
import { normalizeColumnMapping } from '@/lib/data/normalize-column-mapping';

const BATCH_SIZE = 200;

export async function POST(request: NextRequest) {
  const adminKey = process.env.ADMIN_KEY;
  const incomingAdminKey = request.headers.get('x-admin-key');

  if (!adminKey || incomingAdminKey !== adminKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: 'Missing Supabase configuration' },
      { status: 500 },
    );
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, serviceKey);

  const thirtyDaysAgo = subDays(new Date(), 30).toISOString();

  const { data: allUploads, error: uploadsError } = await supabase
    .from('uploads')
    .select('id, org_id, column_mapping')
    .gte('created_at', thirtyDaysAgo);

  if (uploadsError || !allUploads || allUploads.length === 0) {
    return NextResponse.json({
      uploadsProcessed: 0,
      rowsUpdated: 0,
      rowsStillNull: 0,
    });
  }

  const uploads = allUploads.filter(
    (u) => u.column_mapping != null && Object.keys(u.column_mapping ?? {}).length > 0,
  );

  if (uploads.length === 0) {
    return NextResponse.json({
      uploadsProcessed: 0,
      rowsUpdated: 0,
      rowsStillNull: 0,
      uploadsSkipped: allUploads.length,
    });
  }

  let totalUpdated = 0;
  let totalStillNull = 0;

  for (const upload of uploads) {
    const mapping = normalizeColumnMapping(upload.column_mapping);
    const dateHeader = Object.entries(mapping).find(([, role]) => role === 'date')?.[0] ?? null;

    const { data: rows, error: rowsError } = await supabase
      .from('data_rows')
      .select('id, data')
      .eq('upload_id', upload.id)
      .is('date', null);

    if (rowsError || !rows || rows.length === 0) continue;

    const toUpdate: { id: string; date: string }[] = [];
    for (const row of rows) {
      const data = (row.data ?? {}) as Record<string, unknown>;
      const normalized = extractDateFromRow(data, dateHeader);
      if (normalized) {
        toUpdate.push({ id: row.id, date: normalized });
      } else {
        totalStillNull++;
      }
    }

    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const batch = toUpdate.slice(i, i + BATCH_SIZE);
      for (const { id, date } of batch) {
        await supabase.from('data_rows').update({ date }).eq('id', id);
        totalUpdated++;
      }
    }
  }

  return NextResponse.json({
    uploadsProcessed: uploads.length,
    rowsUpdated: totalUpdated,
    rowsStillNull: totalStillNull,
    uploadsSkipped: allUploads.length - uploads.length,
  });
}
