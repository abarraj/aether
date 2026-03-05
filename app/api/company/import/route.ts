/**
 * Company Directory — staff roster import (CSV + XLSX).
 * Detects name/role/tag columns, upserts people + aliases.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Buffer } from 'node:buffer';
import { requirePermission } from '@/lib/auth/org-context';
import { parseCsv } from '@/lib/csv-parser';
import { parseXlsx } from '@/lib/xlsx-parser';
import { importRoster } from '@/lib/data/company-directory';

export async function POST(request: NextRequest) {
  const result = await requirePermission('edit_data');
  if (result instanceof NextResponse) return result;
  const ctx = result;

  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'File is required.' }, { status: 400 });
  }

  const maxBytes = 10 * 1024 * 1024; // 10MB limit for roster
  if (file.size > maxBytes) {
    return NextResponse.json({ error: 'File size exceeds 10MB limit.' }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let headers: string[];
  let rows: Record<string, unknown>[];

  const isXlsx = /\.xlsx?$/i.test(file.name);
  if (isXlsx) {
    const parsed = parseXlsx(buffer);
    headers = parsed.headers;
    rows = parsed.rows;
  } else {
    const parsed = parseCsv(buffer.toString('utf-8'));
    headers = parsed.headers;
    rows = parsed.rows;
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'File contains no data rows.' }, { status: 400 });
  }

  const importResult = await importRoster(ctx.orgId, rows, headers, ctx.supabase);

  return NextResponse.json({
    ...importResult,
    total: rows.length,
  });
}
