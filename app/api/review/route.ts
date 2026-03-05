// API route for resolving review questions (actor ambiguity).
// POST: resolve an actor as staff/client/system/ignore
// GET: fetch pending review questions + existing resolutions

import { NextRequest, NextResponse } from 'next/server';
import { getOrgContext } from '@/lib/auth/org-context';

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { supabase, orgId } = ctx;

  // Fetch latest mapping run with pending review
  const { data: mappingRuns } = await supabase
    .from('mapping_runs')
    .select('id, review_questions, inference_metadata')
    .eq('org_id', orgId)
    .eq('needs_review', true)
    .order('created_at', { ascending: false })
    .limit(1);

  const mappingRun = mappingRuns?.[0] ?? null;
  const questions = (mappingRun?.review_questions ?? []) as {
    id: string;
    type: string;
    question: string;
    suggestion: string;
    confidence: number;
    affected_rows?: number;
    affectedRows?: number;
  }[];

  // Fetch existing resolutions for this org
  const { data: resolutions } = await supabase
    .from('actor_resolutions')
    .select('id, review_question_id, actor_name, normalized_name, resolution, resolved_at')
    .eq('org_id', orgId);

  // Fetch sample rows for context (first 3 data rows containing a given actor)
  const resolvedIds = new Set((resolutions ?? []).map((r) => r.review_question_id));
  const unresolvedQuestions = questions.filter((q) => !resolvedIds.has(q.id));

  return NextResponse.json({
    mappingRunId: mappingRun?.id ?? null,
    questions: unresolvedQuestions.map((q) => ({
      ...q,
      affectedRows: q.affected_rows ?? q.affectedRows ?? 0,
    })),
    resolutions: resolutions ?? [],
    totalQuestions: questions.length,
    resolvedCount: resolvedIds.size,
  });
}

export async function POST(request: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { supabase, orgId, userId } = ctx;

  const body = await request.json() as {
    mappingRunId: string;
    questionId: string;
    actorName: string;
    resolution: 'staff' | 'client' | 'system' | 'ignore';
  };

  if (!body.questionId || !body.actorName || !body.resolution) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  const validResolutions = ['staff', 'client', 'system', 'ignore'];
  if (!validResolutions.includes(body.resolution)) {
    return NextResponse.json({ error: 'Invalid resolution.' }, { status: 400 });
  }

  const normalizedName = body.actorName.trim().toLowerCase();

  // Upsert the actor resolution
  const { error: upsertError } = await supabase
    .from('actor_resolutions')
    .upsert(
      {
        org_id: orgId,
        mapping_run_id: body.mappingRunId || null,
        review_question_id: body.questionId,
        actor_name: body.actorName.trim(),
        normalized_name: normalizedName,
        resolution: body.resolution,
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
      },
      { onConflict: 'org_id, normalized_name' },
    );

  if (upsertError) {
    console.error('Actor resolution upsert error:', upsertError.message);
    return NextResponse.json({ error: 'Failed to save resolution.' }, { status: 500 });
  }

  // If resolved as staff, add to staff_roster_overrides
  if (body.resolution === 'staff') {
    await supabase
      .from('staff_roster_overrides')
      .upsert(
        {
          org_id: orgId,
          name: body.actorName.trim(),
          normalized_name: normalizedName,
          source: 'review_confirm',
        },
        { onConflict: 'org_id, normalized_name' },
      );
  }

  // If resolved as client/system and was previously in staff roster, remove them
  if (body.resolution === 'client' || body.resolution === 'system') {
    await supabase
      .from('staff_roster_overrides')
      .delete()
      .eq('org_id', orgId)
      .eq('normalized_name', normalizedName);
  }

  // Update the mapping_run question's resolved status
  if (body.mappingRunId) {
    const { data: run } = await supabase
      .from('mapping_runs')
      .select('review_questions')
      .eq('id', body.mappingRunId)
      .eq('org_id', orgId)
      .maybeSingle<{ review_questions: { id: string; resolved?: boolean; resolution?: string }[] }>();

    if (run?.review_questions) {
      const updatedQuestions = run.review_questions.map((q) =>
        q.id === body.questionId
          ? { ...q, resolved: true, resolution: body.resolution }
          : q,
      );

      const allResolved = updatedQuestions.every((q) => q.resolved);

      await supabase
        .from('mapping_runs')
        .update({
          review_questions: updatedQuestions,
          ...(allResolved ? { review_status: 'approved', needs_review: false } : {}),
        })
        .eq('id', body.mappingRunId)
        .eq('org_id', orgId);
    }
  }

  return NextResponse.json({ success: true, resolution: body.resolution });
}
