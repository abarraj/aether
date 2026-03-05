// API route handling CSV and XLSX uploads with pipeline stages:
// staging → validated → committed. Creates data_stream + stream_version
// records alongside the legacy upload record for traceability.

import { NextRequest, NextResponse } from 'next/server';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import { getOrgContext } from '@/lib/auth/org-context';
import { parseCsv } from '@/lib/csv-parser';
import { parseXlsx } from '@/lib/xlsx-parser';
import { canAddDataSource, canUploadStorage, canIngestRows, canAddStream } from '@/lib/billing/queries';
import { logAuditEvent } from '@/lib/audit';
import { extractEntities, type OntologyMapping } from '@/lib/data/ontology-extractor';
import { processUploadData } from '@/lib/data/processor';
import { runComputeJob } from '@/lib/data/compute-engine';
import { computePerformanceGaps } from '@/lib/data/performance-gaps';
import { buildOntologyFromDetection } from '@/lib/data/ontology-builder';
import type { OntologyDetection } from '@/lib/ai/ontology-detector';
import {
  isTransactionalDataset,
  runRoleInference,
  filterRowsForStaffEntity,
  buildSystemActorRows,
} from '@/lib/ai/ontology-role-inference';
import { loadStaffRosterFromDb } from '@/lib/data/staff-roster';
import {
  getMappedValue,
  findFallbackDateValue,
  normalizeDate,
} from '@/lib/data/date-mapping';
import { normalizeColumnMapping } from '@/lib/data/normalize-column-mapping';

function getClientIp(request: NextRequest): string | null {
  const ipHeader =
    request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip');
  return ipHeader ? ipHeader.split(',')[0]?.trim() ?? null : null;
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getOrgContext();
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { data: profile } = await ctx.supabase
      .from('profiles')
      .select('email')
      .eq('id', ctx.userId)
      .maybeSingle<{ email: string | null }>();

    const userEmail = profile?.email ?? null;

    const formData = await request.formData();
    const file = formData.get('file');
    const dataTypeRaw = formData.get('data_type');
    const dataType = typeof dataTypeRaw === 'string' && dataTypeRaw.length > 0 ? dataTypeRaw : 'custom';
    const columnMappingRaw = formData.get('column_mapping');
    let columnMapping: Record<string, string> = {};
    if (typeof columnMappingRaw === 'string' && columnMappingRaw.length > 0) {
      try {
        const parsed = JSON.parse(columnMappingRaw) as unknown;
        columnMapping = normalizeColumnMapping(parsed);
      } catch {
        // ignore invalid column_mapping
      }
    }
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

    const maxBytes = 50 * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json({ error: 'File size exceeds 50MB limit.' }, { status: 400 });
    }

    const allowed = await canAddDataSource(ctx.orgId);
    if (!allowed) {
      return NextResponse.json(
        {
          error: 'Data source limit reached for your current plan.',
          upgrade: true,
        },
        { status: 402 },
      );
    }

    // ── Check aggregate storage limit ────────────────────────────────
    const fileMb = Math.ceil(file.size / (1024 * 1024));
    const storageOk = await canUploadStorage(ctx.orgId, fileMb);
    if (!storageOk) {
      return NextResponse.json(
        {
          error: 'Storage limit reached for your current plan.',
          upgrade: true,
        },
        { status: 402 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileChecksum = createHash('sha256').update(buffer).digest('hex');

    // ── STAGE: Staging ──────────────────────────────────────────────
    // Create data_stream (or reuse existing for same data_type)
    let streamId: string | null = null;
    const { data: existingStream } = await ctx.supabase
      .from('data_streams')
      .select('id')
      .eq('org_id', ctx.orgId)
      .eq('data_type', dataType)
      .eq('source_type', 'csv_upload')
      .eq('status', 'active')
      .maybeSingle<{ id: string }>();

    if (existingStream) {
      streamId = existingStream.id;
    } else {
      // ── Check active stream limit before creating a new one ───────
      const streamOk = await canAddStream(ctx.orgId);
      if (!streamOk) {
        return NextResponse.json(
          {
            error: 'Active data stream limit reached for your current plan.',
            upgrade: true,
          },
          { status: 402 },
        );
      }

      const { data: newStream } = await ctx.supabase
        .from('data_streams')
        .insert({
          org_id: ctx.orgId,
          name: file.name.replace(/\.[^.]+$/, ''),
          source_type: 'csv_upload',
          data_type: dataType,
          status: 'active',
          created_by: ctx.userId,
        })
        .select('id')
        .maybeSingle<{ id: string }>();

      streamId = newStream?.id ?? null;
    }

    // Determine next version number
    let versionNumber = 1;
    if (streamId) {
      const { data: latestVersion } = await ctx.supabase
        .from('stream_versions')
        .select('version')
        .eq('stream_id', streamId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle<{ version: number }>();

      versionNumber = (latestVersion?.version ?? 0) + 1;
    }

    // Upload file to storage
    const sanitizedName = file.name.replace(/\s+/g, '-');
    const objectPath = `${ctx.orgId}/${Date.now()}-${sanitizedName}`;

    const { error: storageError } = await ctx.supabase.storage
      .from('uploads')
      .upload(objectPath, buffer, {
        contentType: file.type || 'text/plain',
        upsert: false,
      });

    if (storageError) {
      return NextResponse.json({ error: 'Failed to store file.' }, { status: 500 });
    }

    // Create upload record linked to stream
    const { data: uploadRecord, error: uploadError } = await ctx.supabase
      .from('uploads')
      .insert({
        org_id: ctx.orgId,
        uploaded_by: ctx.userId,
        file_name: file.name,
        file_path: objectPath,
        file_size: file.size,
        data_type: dataType,
        column_mapping: columnMapping,
        status: 'staging',
        stream_id: streamId,
      })
      .select('id')
      .maybeSingle<{ id: string }>();

    if (uploadError || !uploadRecord) {
      return NextResponse.json({ error: 'Failed to create upload record.' }, { status: 500 });
    }

    // Create stream_version in 'staging'
    let streamVersionId: string | null = null;
    if (streamId) {
      const { data: sv } = await ctx.supabase
        .from('stream_versions')
        .insert({
          org_id: ctx.orgId,
          stream_id: streamId,
          upload_id: uploadRecord.id,
          version: versionNumber,
          file_checksum: fileChecksum,
          status: 'staging',
        })
        .select('id')
        .maybeSingle<{ id: string }>();

      streamVersionId = sv?.id ?? null;

      // Link stream_version_id back to upload
      if (streamVersionId) {
        await ctx.supabase
          .from('uploads')
          .update({ stream_version_id: streamVersionId })
          .eq('id', uploadRecord.id);
      }
    }

    // ── STAGE: Validated ────────────────────────────────────────────
    // Parse CSV or XLSX and create data_rows
    const isXlsx = /\.xlsx?$/i.test(file.name);
    let rows: Record<string, unknown>[];

    if (isXlsx) {
      const xlsxResult = parseXlsx(buffer);
      rows = xlsxResult.rows;
    } else {
      const text = buffer.toString('utf-8');
      const csvResult = parseCsv(text);
      rows = csvResult.rows;
    }

    const rowCount = rows.length;

    // ── Check rows-per-month limit ─────────────────────────────────
    if (rowCount > 0) {
      const rowsOk = await canIngestRows(ctx.orgId, rowCount);
      if (!rowsOk) {
        // Clean up: mark upload as error since we already created the record
        await ctx.supabase
          .from('uploads')
          .update({ status: 'error', error_message: 'Monthly row ingestion limit reached.' })
          .eq('id', uploadRecord.id);
        if (streamVersionId) {
          await ctx.supabase
            .from('stream_versions')
            .update({ status: 'rejected', error_message: 'Monthly row ingestion limit reached.' })
            .eq('id', streamVersionId);
        }
        return NextResponse.json(
          {
            error: 'Monthly row ingestion limit reached for your current plan.',
            upgrade: true,
          },
          { status: 402 },
        );
      }
    }

    if (rowCount > 0) {
      const mapping = columnMapping as Record<string, string>;
      const dateHeader = Object.entries(mapping).find(([, role]) => role === 'date')?.[0] ?? null;

      const rowsToInsert = rows.map((row) => {
        const rowAsRecord = row as Record<string, unknown>;
        const rawDate =
          getMappedValue(rowAsRecord, dateHeader) ?? findFallbackDateValue(rowAsRecord);
        const normalized = normalizeDate(rawDate);
        return {
          org_id: ctx.orgId,
          upload_id: uploadRecord.id,
          data_type: dataType,
          data: row,
          date: normalized,
          stream_id: streamId,
          stream_version_id: streamVersionId,
        };
      });

      const { error: rowsError } = await ctx.supabase.from('data_rows').insert(rowsToInsert);

      if (rowsError) {
        // Mark as error in both upload and stream_version
        await ctx.supabase
          .from('uploads')
          .update({ status: 'error', error_message: 'Failed to create data rows.' })
          .eq('id', uploadRecord.id);
        if (streamVersionId) {
          await ctx.supabase
            .from('stream_versions')
            .update({ status: 'rejected', error_message: 'Failed to create data rows.' })
            .eq('id', streamVersionId);
        }

        return NextResponse.json({ error: 'Failed to create data rows.' }, { status: 500 });
      }
    }

    // Data parsed and rows created — mark as validated
    await ctx.supabase
      .from('uploads')
      .update({ status: 'processing', row_count: rowCount })
      .eq('id', uploadRecord.id);

    if (streamVersionId) {
      await ctx.supabase
        .from('stream_versions')
        .update({ status: 'validated', validated_at: new Date().toISOString(), row_count: rowCount })
        .eq('id', streamVersionId);
    }

    // ── STAGE: Committed ────────────────────────────────────────────
    // Step 1: Run deterministic compute job across all active streams.
    // This writes both metric_snapshots (new) and kpi_snapshots (legacy).
    await runComputeJob(ctx.orgId, 'upload', uploadRecord.id);

    // Hoisted for use in both ontology build and response.
    let inferenceNeedsReview = false;
    let inferenceReviewQuestions: unknown[] = [];
    let inferenceMetadataPayload: unknown = {};

    // Step 2: Build ontology (gap engine needs entity_types first)
    // For transactional data, run the role inference engine between
    // AI detection and ontology materialization.
    const detectionRaw = formData.get('detection');
    if (
      typeof detectionRaw === 'string' &&
      detectionRaw.length > 0 &&
      rowCount > 0
    ) {
      try {
        let detection = JSON.parse(detectionRaw) as OntologyDetection;
        if (
          detection &&
          (detection.confidence ?? 0) > 0.3 &&
          (detection.entityTypes?.length ?? 0) > 0
        ) {
          const { data: dataRows } = await ctx.supabase
            .from('data_rows')
            .select('data')
            .eq('org_id', ctx.orgId)
            .eq('upload_id', uploadRecord.id)
            .limit(300)
            .returns<{ data: Record<string, unknown> }[]>();

          let allRows = (dataRows ?? [])
            .map((r: { data: Record<string, unknown> }) => r.data)
            .filter(
              (d: unknown): d is Record<string, unknown> =>
                Boolean(d) && typeof d === 'object',
            );

          // ── Role inference engine (transactional data only) ──────
          const allHeaders = allRows.length > 0 ? Object.keys(allRows[0]!) : [];

          if (allRows.length > 0 && isTransactionalDataset(allHeaders)) {
            // Load staff roster from DB (org-scoped)
            const staffNames = await loadStaffRosterFromDb(ctx.orgId, ctx.supabase);

            const inferenceResult = runRoleInference(
              allRows,
              allHeaders,
              staffNames,
              detection,
            );

            // Use the corrected detection (canonical entity types)
            detection = inferenceResult.detection;
            inferenceNeedsReview = inferenceResult.needsReview;
            inferenceReviewQuestions = inferenceResult.reviewQuestions;
            inferenceMetadataPayload = inferenceResult.metadata;

            // Filter rows for Staff entity: blank out non-staff Users
            const userColumn = allHeaders.find((h) => /^user$/i.test(h.trim()));
            if (userColumn) {
              // Build two row sets:
              // 1. Staff-filtered rows (User column nulled for non-staff)
              const staffFilteredRows = filterRowsForStaffEntity(
                allRows,
                inferenceResult.rowInferences,
                userColumn,
              );
              // 2. SystemActor rows (User replaced with "Online Checkout" for self-checkout)
              const systemActorRows = buildSystemActorRows(
                staffFilteredRows,
                inferenceResult.rowInferences,
                userColumn,
              );
              allRows = systemActorRows;
            }
          }

          // Create mapping_run record for traceability
          if (streamVersionId) {
            await ctx.supabase.from('mapping_runs').insert({
              org_id: ctx.orgId,
              stream_version_id: streamVersionId,
              column_mapping: columnMapping,
              entity_mapping: detection.entityTypes ?? [],
              overall_confidence: detection.confidence ?? 0,
              needs_review: inferenceNeedsReview || (detection.confidence ?? 0) < 0.7,
              review_status: inferenceNeedsReview ? 'pending' : ((detection.confidence ?? 0) >= 0.7 ? 'approved' : 'pending'),
              approved_by: (!inferenceNeedsReview && (detection.confidence ?? 0) >= 0.7) ? ctx.userId : null,
              approved_at: (!inferenceNeedsReview && (detection.confidence ?? 0) >= 0.7) ? new Date().toISOString() : null,
              review_questions: inferenceReviewQuestions,
              inference_metadata: inferenceMetadataPayload,
            });
          }

          if (allRows.length > 0) {
            const counts = await buildOntologyFromDetection(
              ctx.orgId,
              uploadRecord.id,
              detection,
              allRows,
            );

            await logAuditEvent({
              orgId: ctx.orgId,
              actorId: ctx.userId,
              actorEmail: userEmail,
              action: 'ontology.auto_detected',
              targetType: 'upload',
              targetId: uploadRecord.id,
              description: `Auto-detected ontology from ${file.name}`,
              metadata: {
                entity_types: detection.entityTypes?.length ?? 0,
                relationships: detection.relationships?.length ?? 0,
                entityTypesCreated: counts.entityTypesCreated,
                entitiesCreated: counts.entitiesCreated,
                relationshipsCreated: counts.relationshipsCreated,
                confidence: detection.confidence,
                roleInference: inferenceMetadataPayload,
                needsReview: inferenceNeedsReview,
              },
              ipAddress: getClientIp(request),
            });
          }
        }
      } catch (detectionErr) {
        console.error('Ontology build from detection failed:', detectionErr);
      }
    }

    // Step 3: Compute performance gaps AFTER ontology exists
    try {
      await computePerformanceGaps(ctx.orgId, uploadRecord.id);
    } catch (gapErr) {
      console.error('Performance gap computation failed:', gapErr);
    }

    // Step 4: Mark as committed (ready)
    await ctx.supabase
      .from('uploads')
      .update({ status: 'ready' })
      .eq('id', uploadRecord.id);

    if (streamVersionId) {
      await ctx.supabase
        .from('stream_versions')
        .update({
          status: 'committed',
          committed_at: new Date().toISOString(),
          committed_by: ctx.userId,
        })
        .eq('id', streamVersionId);
    }

    // Handle manual ontology mapping if provided
    let ontologyResult: { entitiesCreated: number; relationshipsCreated: number } | undefined;
    if (ontology && rowCount > 0) {
      const result = await extractEntities(ctx.orgId, uploadRecord.id, ontology);
      ontologyResult = result;
    }

    await logAuditEvent({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      actorEmail: userEmail,
      action: 'data.upload',
      targetType: 'upload',
      targetId: uploadRecord.id,
      description: `${userEmail ?? 'User'} uploaded ${file.name}`,
      metadata: {
        data_type: dataType,
        row_count: rowCount,
        file_size: file.size,
        stream_id: streamId,
        stream_version: versionNumber,
      },
      ipAddress: getClientIp(request),
    });

    // Build review summary for client toast
    const reviewQuestionCount = Array.isArray(inferenceReviewQuestions) ? inferenceReviewQuestions.length : 0;
    const reviewSummary = inferenceNeedsReview && reviewQuestionCount > 0
      ? `Imported successfully, but ${reviewQuestionCount} item${reviewQuestionCount > 1 ? 's' : ''} need${reviewQuestionCount === 1 ? 's' : ''} your review. Check Your Business for details.`
      : undefined;

    return NextResponse.json(
      {
        id: uploadRecord.id,
        rowCount,
        ontology: ontologyResult,
        streamId,
        streamVersionId,
        needsReview: inferenceNeedsReview,
        reviewSummary,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json({ error: 'Unexpected error during upload.' }, { status: 500 });
  }
}
