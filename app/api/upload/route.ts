// API route handling CSV uploads, storage, and data row creation.

import { NextRequest, NextResponse } from 'next/server';
import { Buffer } from 'node:buffer';

import { createClient } from '@/lib/supabase/server';
import { parseCsv } from '@/lib/csv-parser';
import { canAddDataSource } from '@/lib/billing/queries';
import { logAuditEvent } from '@/lib/audit';
import { extractEntities, type OntologyMapping } from '@/lib/data/ontology-extractor';
import { processUploadData } from '@/lib/data/processor';
import { detectOntology } from '@/lib/ai/ontology-detector';
import { buildOntologyFromDetection } from '@/lib/data/ontology-builder';

type ProfileOrg = {
  org_id: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const formData = await request.formData();
    const file = formData.get('file');
    const dataTypeRaw = formData.get('data_type');
    const dataType = typeof dataTypeRaw === 'string' && dataTypeRaw.length > 0 ? dataTypeRaw : 'custom';
    const ontologyRaw = formData.get('ontology');
    let ontology: OntologyMapping | null = null;
    if (typeof ontologyRaw === 'string' && ontologyRaw.length > 0) {
      try {
        const parsed = JSON.parse(ontologyRaw) as OntologyMapping;
        if (parsed?.entityTypeId && parsed?.nameColumn) {
          ontology = {
            entityTypeId: parsed.entityTypeId,
            nameColumn: parsed.nameColumn,
            columnToProperty: typeof parsed.columnToProperty === 'object' ? parsed.columnToProperty ?? {} : {},
            relationshipColumns: Array.isArray(parsed.relationshipColumns) ? parsed.relationshipColumns : undefined,
          };
        }
      } catch {
        // ignore invalid ontology payload
      }
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File is required.' }, { status: 400 });
    }

    const maxBytes = 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json({ error: 'File size exceeds 10MB limit.' }, { status: 400 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .maybeSingle<ProfileOrg>();

    if (profileError || !profile?.org_id) {
      return NextResponse.json({ error: 'User is not associated with an organization.' }, { status: 400 });
    }

    const orgId = profile.org_id;

    const allowed = await canAddDataSource(orgId);
    if (!allowed) {
      return NextResponse.json(
        {
          error: 'Data source limit reached for your current plan.',
          upgrade: true,
        },
        { status: 402 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const sanitizedName = file.name.replace(/\s+/g, '-');
    const objectPath = `${orgId}/${Date.now()}-${sanitizedName}`;

    const { error: storageError } = await supabase.storage
      .from('uploads')
      .upload(objectPath, buffer, {
        contentType: file.type || 'text/plain',
        upsert: false,
      });

    if (storageError) {
      return NextResponse.json({ error: 'Failed to store file.' }, { status: 500 });
    }

    const { data: uploadRecord, error: uploadError } = await supabase
      .from('uploads')
      .insert({
        org_id: orgId,
        uploaded_by: user.id,
        file_name: file.name,
        file_path: objectPath,
        file_size: file.size,
        data_type: dataType,
        status: 'processing',
      })
      .select('id')
      .maybeSingle<{ id: string }>();

    if (uploadError || !uploadRecord) {
      return NextResponse.json({ error: 'Failed to create upload record.' }, { status: 500 });
    }

    const text = buffer.toString('utf-8');
    const { rows } = parseCsv(text);
    const rowCount = rows.length;

    if (rowCount > 0) {
      const rowsToInsert = rows.map((row) => ({
        org_id: orgId,
        upload_id: uploadRecord.id,
        data_type: dataType,
        data: row,
        date: row.date && row.date.length > 0 ? row.date : null,
      }));

      const { error: rowsError } = await supabase.from('data_rows').insert(rowsToInsert);

      if (rowsError) {
        await supabase
          .from('uploads')
          .update({ status: 'error', error_message: 'Failed to create data rows.' })
          .eq('id', uploadRecord.id);

        return NextResponse.json({ error: 'Failed to create data rows.' }, { status: 500 });
      }
    }

    const { error: updateError } = await supabase
      .from('uploads')
      .update({
        status: 'ready',
        row_count: rowCount,
      })
      .eq('id', uploadRecord.id);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to finalize upload.' }, { status: 500 });
    }

    await processUploadData(orgId, uploadRecord.id);

    const ipHeader = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip');
    const ipAddress = ipHeader ? ipHeader.split(',')[0]?.trim() ?? null : null;

    // Auto-detect ontology from upload data
    try {
      try {
        const sb = await createClient();
        const { data: dataRows } = await sb
          .from('data_rows')
          .select('data')
          .eq('org_id', orgId)
          .eq('upload_id', uploadRecord.id)
          .returns<{ data: Record<string, unknown> }[]>();

        const allRows = (dataRows ?? [])
          .map((r: { data: Record<string, unknown> }) => r.data)
          .filter((d: unknown): d is Record<string, unknown> => Boolean(d) && typeof d === 'object');
        if (allRows.length === 0) return;
        const headers = Object.keys(allRows[0] ?? {});
        if (headers.length === 0) return;

        const detection = await detectOntology(headers, allRows, orgId);
        if (detection.confidence <= 0.3 || detection.entityTypes.length === 0) return;

        const counts = await buildOntologyFromDetection(orgId, uploadRecord.id, detection, allRows);
        await logAuditEvent({
          orgId,
          actorId: user.id,
          actorEmail: user.email ?? null,
          action: 'ontology.auto_detected',
          targetType: 'upload',
          targetId: uploadRecord.id,
          description: `Auto-detected ontology from ${file.name}`,
          metadata: {
            entity_types: detection.entityTypes.length,
            relationships: detection.relationships.length,
            entityTypesCreated: counts.entityTypesCreated,
            entitiesCreated: counts.entitiesCreated,
            relationshipsCreated: counts.relationshipsCreated,
            confidence: detection.confidence,
            reasoning: detection.reasoning,
          },
          ipAddress,
        });
      } catch (_err) {
        // Do not fail upload; log in audit or server logs if needed
      }
    } catch (detectionError) {
      console.error("Ontology detection failed:", detectionError);
    }

    let ontologyResult: { entitiesCreated: number; relationshipsCreated: number } | undefined;
    if (ontology && rowCount > 0) {
      const result = await extractEntities(orgId, uploadRecord.id, ontology);
      ontologyResult = result;
    }

    await logAuditEvent({
      orgId: orgId,
      actorId: user.id,
      actorEmail: user.email ?? null,
      action: 'data.upload',
      targetType: 'upload',
      targetId: uploadRecord.id,
      description: `${user.email ?? 'User'} uploaded ${file.name}`,
      metadata: {
        data_type: dataType,
        row_count: rowCount,
        file_size: file.size,
      },
      ipAddress,
    });

    return NextResponse.json(
      { id: uploadRecord.id, rowCount, ontology: ontologyResult },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json({ error: 'Unexpected error during upload.' }, { status: 500 });
  }
}

