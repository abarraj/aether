// Background processing endpoint for upload data.
// Called by the upload route after data_rows are inserted.

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { processUploadData } from '@/lib/data/processor';
import { computePerformanceGaps } from '@/lib/data/performance-gaps';
import { detectOntology } from '@/lib/ai/ontology-detector';
import { buildOntologyFromDetection } from '@/lib/data/ontology-builder';
import { logAuditEvent } from '@/lib/audit';

export const maxDuration = 60; // Allow up to 60s for this background task

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      orgId: string;
      uploadId: string;
      userId: string;
      userEmail: string | null;
      fileName: string;
      ipAddress: string | null;
    };

    const { orgId, uploadId, userId, userEmail, fileName, ipAddress } = body;

    // Verify the request is internal (basic check)
    const internalSecret = request.headers.get('x-internal-secret');
    if (
      internalSecret !== process.env.INTERNAL_API_SECRET &&
      process.env.INTERNAL_API_SECRET
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();

    // Step 1: Process KPI snapshots
    await processUploadData(orgId, uploadId);

    // Step 2: Compute performance gaps
    try {
      await computePerformanceGaps(orgId, uploadId);
    } catch (err) {
      console.error('Performance gap computation failed:', err);
    }

    // Step 3: Auto-detect ontology
    try {
      const { data: dataRows } = await supabase
        .from('data_rows')
        .select('data')
        .eq('org_id', orgId)
        .eq('upload_id', uploadId)
        .limit(300)
        .returns<{ data: Record<string, unknown> }[]>();

      const allRows = (dataRows ?? [])
        .map((r) => r.data)
        .filter(
          (d): d is Record<string, unknown> =>
            Boolean(d) && typeof d === 'object',
        );

      if (allRows.length > 0) {
        const headers = Object.keys(allRows[0] ?? {});
        if (headers.length > 0) {
          const detection = await detectOntology(headers, allRows, orgId);
          if (
            detection.confidence > 0.3 &&
            detection.entityTypes.length > 0
          ) {
            const counts = await buildOntologyFromDetection(
              orgId,
              uploadId,
              detection,
              allRows,
            );
            await logAuditEvent({
              orgId,
              actorId: userId,
              actorEmail: userEmail,
              action: 'ontology.auto_detected',
              targetType: 'upload',
              targetId: uploadId,
              description: `Auto-detected ontology from ${fileName}`,
              metadata: {
                entity_types: detection.entityTypes.length,
                relationships: detection.relationships.length,
                entityTypesCreated: counts.entityTypesCreated,
                entitiesCreated: counts.entitiesCreated,
                relationshipsCreated: counts.relationshipsCreated,
                confidence: detection.confidence,
              },
              ipAddress,
            });
          }
        }
      }
    } catch (err) {
      console.error('Ontology detection failed:', err);
    }

    // Mark upload as fully processed
    await supabase
      .from('uploads')
      .update({ status: 'ready' })
      .eq('id', uploadId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Background processing error:', error);
    return NextResponse.json(
      { error: 'Processing failed' },
      { status: 500 },
    );
  }
}
