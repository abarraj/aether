/**
 * Company Directory API — list and create people.
 * All operations derive org_id from session (never from client).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOrgContext, requirePermission } from '@/lib/auth/org-context';
import {
  listPeople,
  createPerson,
  updatePerson,
  addAlias,
  removeAlias,
  assignRoles,
  setTags,
  listRoles,
  listTags,
  type CreatePersonPayload,
} from '@/lib/data/company-directory';

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [people, roles, tags] = await Promise.all([
    listPeople(ctx.orgId, ctx.supabase),
    listRoles(ctx.orgId, ctx.supabase),
    listTags(ctx.orgId, ctx.supabase),
  ]);

  return NextResponse.json({ people, roles, tags });
}

export async function POST(request: NextRequest) {
  const result = await requirePermission('edit_data');
  if (result instanceof NextResponse) return result;
  const ctx = result;

  const body = await request.json() as Record<string, unknown>;
  const action = body.action as string | undefined;

  // ── Create person ──
  if (!action || action === 'create') {
    const payload = body as unknown as CreatePersonPayload;
    if (!payload.display_name?.trim()) {
      return NextResponse.json({ error: 'display_name is required.' }, { status: 400 });
    }

    const person = await createPerson(ctx.orgId, payload, ctx.supabase);
    if (!person) {
      return NextResponse.json({ error: 'Failed to create person. Name may already exist.' }, { status: 409 });
    }

    return NextResponse.json({ person }, { status: 201 });
  }

  // ── Update person ──
  if (action === 'update') {
    const personId = body.person_id as string;
    if (!personId) return NextResponse.json({ error: 'person_id required.' }, { status: 400 });

    const ok = await updatePerson(ctx.orgId, personId, body as Record<string, unknown>, ctx.supabase);
    return ok
      ? NextResponse.json({ success: true })
      : NextResponse.json({ error: 'Update failed.' }, { status: 500 });
  }

  // ── Assign roles ──
  if (action === 'assign_roles') {
    const personId = body.person_id as string;
    const roleKeys = body.role_keys as string[];
    if (!personId || !roleKeys?.length) {
      return NextResponse.json({ error: 'person_id and role_keys required.' }, { status: 400 });
    }
    await assignRoles(ctx.orgId, personId, roleKeys, ctx.supabase);
    return NextResponse.json({ success: true });
  }

  // ── Set tags ──
  if (action === 'set_tags') {
    const personId = body.person_id as string;
    const tagSlugs = body.tag_slugs as string[];
    if (!personId || !tagSlugs) {
      return NextResponse.json({ error: 'person_id and tag_slugs required.' }, { status: 400 });
    }
    await setTags(ctx.orgId, personId, tagSlugs, ctx.supabase);
    return NextResponse.json({ success: true });
  }

  // ── Add alias ──
  if (action === 'add_alias') {
    const personId = body.person_id as string;
    const alias = body.alias as string;
    if (!personId || !alias?.trim()) {
      return NextResponse.json({ error: 'person_id and alias required.' }, { status: 400 });
    }
    const ok = await addAlias(ctx.orgId, personId, alias, ctx.supabase);
    return ok
      ? NextResponse.json({ success: true })
      : NextResponse.json({ error: 'Alias may already exist.' }, { status: 409 });
  }

  // ── Remove alias ──
  if (action === 'remove_alias') {
    const aliasId = body.alias_id as string;
    if (!aliasId) return NextResponse.json({ error: 'alias_id required.' }, { status: 400 });
    const ok = await removeAlias(ctx.orgId, aliasId, ctx.supabase);
    return ok
      ? NextResponse.json({ success: true })
      : NextResponse.json({ error: 'Remove failed.' }, { status: 500 });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
