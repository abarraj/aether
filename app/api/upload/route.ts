// API route handling CSV and XLSX uploads with pipeline stages:
// staging → validated → committed. Creates data_stream + stream_version
// records alongside the legacy upload record for traceability.
//
// PERF: billing checks are batched via uploadPreCheck (single plan resolve),
// heavy compute (runComputeJob, computePerformanceGaps) fires after the
// response, and in-memory rows are reused for inference (no re-read).

import { NextRequest, NextResponse } from 'next/server';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import { getOrgContext } from '@/lib/auth/org-context';
import { parseCsv } from '@/lib/csv-parser';
import { parseXlsx } from '@/lib/xlsx-parser';
import { canIngestRows, uploadPreCheck } from '@/lib/billing/queries';
import { logAuditEvent } from '@/lib/audit';
import { extractEntities, type OntologyMapping } from '@/lib/data/ontology-extractor';
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
import { loadStaffNamesFromDirectory } from '@/lib/data/company-directory';
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

    // Parse detection payload EARLY — we persist it to the upload record
    const detectionRawEarly = formData.get('detection');
    let detectionPayload: OntologyDetection | null = null;
    if (typeof detectionRawEarly === 'string' && detectionRawEarly.length > 0) {
      try {
        detectionPayload = JSON.parse(detectionRawEarly) as OntologyDetection;
      } catch {
        // ignore invalid detection
      }
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File is required.' }, { status: 400 });
    }

    const maxBytes = 50 * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json({ error: 'File size exceeds 50MB limit.' }, { status: 400 });
    }

    // ── Parse file + billing pre-check IN PARALLEL ──────────────────
    // These two operations are independent: parse the file while checking limits.
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Check if we need a new stream (runs a quick query)
    const { data: existingStream } = await ctx.supabase
      .from('data_streams')
      .select('id')
      .eq('org_id', ctx.orgId)
      .eq('data_type', dataType)
      .eq('source_type', 'csv_upload')
      .eq('status', 'active')
      .maybeSingle<{ id: string }>();

    const needsNewStream = !existingStream;
    const fileMb = Math.ceil(file.size / (1024 * 1024));

    // Parse file + billing check + profile query + hash — all in parallel
    const isXlsx = /\.xlsx?$/i.test(file.name);
    const [preCheck, profileResult, fileChecksum, rows] = await Promise.all([
      uploadPreCheck(ctx.orgId, fileMb, needsNewStream),
      ctx.supabase.from('profiles').select('email').eq('id', ctx.userId).maybeSingle<{ email: string | null }>(),
      Promise.resolve(createHash('sha256').update(buffer).digest('hex')),
      Promise.resolve(
        isXlsx
          ? parseXlsx(buffer).rows
          : parseCsv(buffer.toString('utf-8')).rows,
      ),
    ]);

    const userEmail = profileResult.data?.email ?? null;

    // Enforce billing limits (fast — already resolved)
    if (!preCheck.dataSourceOk) {
      return NextResponse.json(
        { error: 'Data source limit reached for your current plan.', upgrade: true },
        { status: 402 },
      );
    }
    if (!preCheck.storageOk) {
      return NextResponse.json(
        { error: 'Storage limit reached for your current plan.', upgrade: true },
        { status: 402 },
      );
    }
    if (!preCheck.streamOk) {
      return NextResponse.json(
        { error: 'Active data stream limit reached for your current plan.', upgrade: true },
        { status: 402 },
      );
    }

    // ── Server-side detection fallback ──────────────────────────────
    // If client didn't send detection (or it's very low confidence),
    // run server-side detection so every upload gets classified.
    if (!detectionPayload || (detectionPayload.confidence ?? 0) < 0.1) {
      try {
        const sampleRows = rows.slice(0, 50) as Record<string, string>[];
        const headers = sampleRows.length > 0 ? Object.keys(sampleRows[0]) : [];
        if (headers.length > 0) {
          const { detectOntology } = await import('@/lib/ai/ontology-detector');
          detectionPayload = await detectOntology(headers, sampleRows, ctx.orgId);
        }
      } catch (detErr) {
        console.error('Server-side detection fallback failed:', detErr);
        // Non-fatal: continue without detection
      }
    }

    // ── STAGE: Staging ──────────────────────────────────────────────
    let streamId: string | null = existingStream?.id ?? null;

    if (!streamId) {
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

    // Version number + storage upload + upload record — version query first
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

    // Storage upload + upload record creation — in parallel
    const sanitizedName = file.name.replace(/\s+/g, '-');
    const objectPath = `${ctx.orgId}/${Date.now()}-${sanitizedName}`;

    const [storageResult, ] = await Promise.all([
      ctx.supabase.storage
        .from('uploads')
        .upload(objectPath, buffer, {
          contentType: file.type || 'text/plain',
          upsert: false,
        }),
    ]);

    if (storageResult.error) {
      return NextResponse.json({ error: 'Failed to store file.' }, { status: 500 });
    }

    // Create upload record — include detection if available
    const uploadInsert: Record<string, unknown> = {
      org_id: ctx.orgId,
      uploaded_by: ctx.userId,
      file_name: file.name,
      file_path: objectPath,
      file_size: file.size,
      data_type: dataType,
      column_mapping: columnMapping,
      status: 'staging',
      stream_id: streamId,
    };
    if (detectionPayload) {
      uploadInsert.detection = detectionPayload;
      uploadInsert.detection_confidence = detectionPayload.confidence ?? null;
      uploadInsert.detection_stream_type = detectionPayload.streamType ?? 'unknown';
      uploadInsert.detection_version = 1;
    }

    const { data: uploadRecord, error: uploadError } = await ctx.supabase
      .from('uploads')
      .insert(uploadInsert)
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
    const rowCount = rows.length;

    // Check rows-per-month limit
    if (rowCount > 0) {
      const rowsOk = await canIngestRows(ctx.orgId, rowCount);
      if (!rowsOk) {
        // Clean up: mark as error
        await Promise.all([
          ctx.supabase.from('uploads')
            .update({ status: 'error', error_message: 'Monthly row ingestion limit reached.' })
            .eq('id', uploadRecord.id),
          streamVersionId
            ? ctx.supabase.from('stream_versions')
                .update({ status: 'rejected', error_message: 'Monthly row ingestion limit reached.' })
                .eq('id', streamVersionId)
            : Promise.resolve(),
        ]);
        return NextResponse.json(
          { error: 'Monthly row ingestion limit reached for your current plan.', upgrade: true },
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
        await Promise.all([
          ctx.supabase.from('uploads')
            .update({ status: 'error', error_message: 'Failed to create data rows.' })
            .eq('id', uploadRecord.id),
          streamVersionId
            ? ctx.supabase.from('stream_versions')
                .update({ status: 'rejected', error_message: 'Failed to create data rows.' })
                .eq('id', streamVersionId)
            : Promise.resolve(),
        ]);
        return NextResponse.json({ error: 'Failed to create data rows.' }, { status: 500 });
      }
    }

    // Mark as validated — both updates in parallel
    await Promise.all([
      ctx.supabase.from('uploads')
        .update({ status: 'processing', row_count: rowCount })
        .eq('id', uploadRecord.id),
      streamVersionId
        ? ctx.supabase.from('stream_versions')
            .update({ status: 'validated', validated_at: new Date().toISOString(), row_count: rowCount })
            .eq('id', streamVersionId)
        : Promise.resolve(),
    ]);

    // ── STAGE: Committed ────────────────────────────────────────────
    // Role inference uses IN-MEMORY rows — no re-read from DB.
    let inferenceNeedsReview = false;
    let inferenceReviewQuestions: unknown[] = [];
    let inferenceMetadataPayload: unknown = {};
    let ontologyResult: { entitiesCreated: number; relationshipsCreated: number } | undefined;

    if (
      detectionPayload &&
      (detectionPayload.confidence ?? 0) > 0.3 &&
      (detectionPayload.entityTypes?.length ?? 0) > 0 &&
      rowCount > 0
    ) {
      try {
        let detection = detectionPayload;

          // Use in-memory rows directly — no DB re-read needed
          let allRows = rows
            .filter(
              (d: unknown): d is Record<string, unknown> =>
                Boolean(d) && typeof d === 'object',
            )
            .slice(0, 300);

          // ── Role inference engine (transactional data only) ──────
          const allHeaders = allRows.length > 0 ? Object.keys(allRows[0]!) : [];

          if (allRows.length > 0 && isTransactionalDataset(allHeaders)) {
            // Load staff names from both legacy roster overrides AND Company Directory
            const [legacyNames, directoryNames] = await Promise.all([
              loadStaffRosterFromDb(ctx.orgId, ctx.supabase),
              loadStaffNamesFromDirectory(ctx.orgId, ctx.supabase),
            ]);
            const staffNames = new Set([...legacyNames, ...directoryNames]);

            const inferenceResult = runRoleInference(
              allRows,
              allHeaders,
              staffNames,
              detection,
            );

            detection = inferenceResult.detection;
            inferenceNeedsReview = inferenceResult.needsReview;
            inferenceReviewQuestions = inferenceResult.reviewQuestions;
            inferenceMetadataPayload = inferenceResult.metadata;

            const userColumn = allHeaders.find((h) => /^user$/i.test(h.trim()));
            if (userColumn) {
              const staffFilteredRows = filterRowsForStaffEntity(
                allRows,
                inferenceResult.rowInferences,
                userColumn,
              );
              const systemActorRows = buildSystemActorRows(
                staffFilteredRows,
                inferenceResult.rowInferences,
                userColumn,
              );
              allRows = systemActorRows;
            }
          }

          // mapping_run + ontology build — mapping_run doesn't block ontology
          const mappingRunPromise = streamVersionId
            ? ctx.supabase.from('mapping_runs').insert({
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
              })
            : Promise.resolve();

          if (allRows.length > 0) {
            // Run mapping_run insert + ontology build in parallel
            const [, counts] = await Promise.all([
              mappingRunPromise,
              buildOntologyFromDetection(
                ctx.orgId,
                uploadRecord.id,
                detection,
                allRows,
              ),
            ]);

            ontologyResult = { entitiesCreated: counts.entitiesCreated, relationshipsCreated: counts.relationshipsCreated };

            // Audit log — fire and forget (don't block response)
            logAuditEvent({
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
            }).catch(() => { /* non-blocking */ });
          } else {
            await mappingRunPromise;
          }
      } catch (detectionErr) {
        console.error('Ontology build from detection failed:', detectionErr);
      }
    }

    // Handle manual ontology mapping if provided
    if (ontology && rowCount > 0) {
      const result = await extractEntities(ctx.orgId, uploadRecord.id, ontology);
      ontologyResult = result;
    }

    // ── Mark as committed + fire-and-forget heavy compute ───────────
    // These status updates + audit log run in parallel. Heavy compute
    // (runComputeJob, computePerformanceGaps) fires AFTER the response
    // so the user sees "done" immediately.
    const commitPromises: PromiseLike<unknown>[] = [
      ctx.supabase.from('uploads')
        .update({ status: 'ready' })
        .eq('id', uploadRecord.id),
      logAuditEvent({
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
      }),
    ];
    if (streamVersionId) {
      commitPromises.push(
        ctx.supabase.from('stream_versions')
          .update({
            status: 'committed',
            committed_at: new Date().toISOString(),
            committed_by: ctx.userId,
          })
          .eq('id', streamVersionId),
      );
    }
    await Promise.all(commitPromises);

    // ── Fire-and-forget: heavy compute runs AFTER the response ──────
    // These don't block the user. Errors are logged but don't fail the upload.
    const bgOrgId = ctx.orgId;
    const bgUploadId = uploadRecord.id;
    Promise.all([
      runComputeJob(bgOrgId, 'upload', bgUploadId).catch((err) =>
        console.error('Background compute job failed:', err),
      ),
      computePerformanceGaps(bgOrgId, bgUploadId).catch((err) =>
        console.error('Background performance gaps failed:', err),
      ),
    ]).catch(() => { /* swallow */ });

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
