/**
 * Company Directory data access layer.
 *
 * All functions derive org_id from the server session — never from the client.
 * Used by the Company page for CRUD and by the ingestion engine for actor resolution.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizePersonName } from '@/lib/ai/ontology-role-inference';

// ── Types ─────────────────────────────────────────────────────────────

export interface CompanyPerson {
  id: string;
  org_id: string;
  display_name: string;
  canonical_name: string;
  email: string | null;
  phone: string | null;
  status: 'active' | 'inactive';
  source: 'manual' | 'upload' | 'integration';
  notes: string | null;
  created_at: string;
  updated_at: string;
  roles?: CompanyRoleAssignment[];
  tags?: CompanyTagAssignment[];
  aliases?: CompanyPersonAlias[];
}

export interface CompanyRole {
  id: string;
  org_id: string;
  key: string;
  label: string;
  created_at: string;
}

export interface CompanyRoleAssignment {
  id: string;
  role_id: string;
  role?: CompanyRole;
}

export interface CompanyTag {
  id: string;
  org_id: string;
  slug: string;
  label: string;
  color: string;
  created_at: string;
}

export interface CompanyTagAssignment {
  id: string;
  tag_id: string;
  tag?: CompanyTag;
}

export interface CompanyPersonAlias {
  id: string;
  person_id: string;
  alias: string;
  canonical_alias: string;
}

export interface CreatePersonPayload {
  display_name: string;
  email?: string | null;
  phone?: string | null;
  status?: 'active' | 'inactive';
  source?: 'manual' | 'upload' | 'integration';
  notes?: string | null;
  role_keys?: string[];
  tag_slugs?: string[];
  aliases?: string[];
}

export interface UpdatePersonPayload {
  display_name?: string;
  email?: string | null;
  phone?: string | null;
  status?: 'active' | 'inactive';
  notes?: string | null;
}

// ── Actor resolution types ────────────────────────────────────────────

export type ActorMatchType = 'exact' | 'alias' | 'fuzzy' | 'none';

export interface ActorResolution {
  matched: boolean;
  matchType: ActorMatchType;
  person: CompanyPerson | null;
  confidence: number;
}

// ── Slug / key helpers ────────────────────────────────────────────────

function toSlug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// ── Alias generation ──────────────────────────────────────────────────

/** Generate canonical aliases from a display name. */
export function generateAliases(displayName: string): string[] {
  const aliases = new Set<string>();
  const canonical = normalizePersonName(displayName);
  aliases.add(canonical);

  // stripped punctuation variant
  const stripped = displayName.replace(/[^a-zA-Z0-9\s]/g, '').trim();
  if (stripped) aliases.add(normalizePersonName(stripped));

  // lowercased original
  const lower = displayName.toLowerCase().trim();
  if (lower) aliases.add(normalizePersonName(lower));

  return Array.from(aliases);
}

// ── CRUD operations ────────────────────────────────────────────────────

export async function listPeople(
  orgId: string,
  supabase: SupabaseClient,
): Promise<CompanyPerson[]> {
  const { data } = await supabase
    .from('company_people')
    .select(`
      *,
      company_role_assignments ( id, role_id, company_roles ( id, key, label ) ),
      company_tag_assignments ( id, tag_id, company_tags ( id, slug, label, color ) ),
      company_person_aliases ( id, person_id, alias, canonical_alias )
    `)
    .eq('org_id', orgId)
    .order('display_name');

  if (!data) return [];

  return (data as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    org_id: row.org_id as string,
    display_name: row.display_name as string,
    canonical_name: row.canonical_name as string,
    email: row.email as string | null,
    phone: row.phone as string | null,
    status: row.status as 'active' | 'inactive',
    source: row.source as 'manual' | 'upload' | 'integration',
    notes: row.notes as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    roles: ((row.company_role_assignments ?? []) as Record<string, unknown>[]).map((ra) => ({
      id: ra.id as string,
      role_id: ra.role_id as string,
      role: ra.company_roles as CompanyRole | undefined,
    })),
    tags: ((row.company_tag_assignments ?? []) as Record<string, unknown>[]).map((ta) => ({
      id: ta.id as string,
      tag_id: ta.tag_id as string,
      tag: ta.company_tags as CompanyTag | undefined,
    })),
    aliases: (row.company_person_aliases ?? []) as CompanyPersonAlias[],
  }));
}

export async function createPerson(
  orgId: string,
  payload: CreatePersonPayload,
  supabase: SupabaseClient,
): Promise<CompanyPerson | null> {
  const canonical = normalizePersonName(payload.display_name);

  const { data: person, error } = await supabase
    .from('company_people')
    .insert({
      org_id: orgId,
      display_name: payload.display_name.trim(),
      canonical_name: canonical,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      status: payload.status ?? 'active',
      source: payload.source ?? 'manual',
      notes: payload.notes ?? null,
    })
    .select('*')
    .maybeSingle();

  if (error || !person) return null;

  const typedPerson = person as unknown as CompanyPerson;

  // Create default aliases
  const aliasStrings = payload.aliases?.length
    ? payload.aliases
    : [payload.display_name.trim()];

  const allCanonicals = new Set<string>();
  const aliasRows: { org_id: string; person_id: string; alias: string; canonical_alias: string }[] = [];

  for (const a of aliasStrings) {
    for (const ca of generateAliases(a)) {
      if (!allCanonicals.has(ca)) {
        allCanonicals.add(ca);
        aliasRows.push({
          org_id: orgId,
          person_id: typedPerson.id,
          alias: a.trim(),
          canonical_alias: ca,
        });
      }
    }
  }

  if (aliasRows.length > 0) {
    await supabase
      .from('company_person_aliases')
      .upsert(aliasRows, { onConflict: 'org_id,canonical_alias', ignoreDuplicates: true });
  }

  // Assign roles if provided
  if (payload.role_keys?.length) {
    await assignRoles(orgId, typedPerson.id, payload.role_keys, supabase);
  }

  // Assign tags if provided
  if (payload.tag_slugs?.length) {
    await setTags(orgId, typedPerson.id, payload.tag_slugs, supabase);
  }

  return typedPerson;
}

export async function updatePerson(
  orgId: string,
  personId: string,
  payload: UpdatePersonPayload,
  supabase: SupabaseClient,
): Promise<boolean> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (payload.display_name !== undefined) {
    updates.display_name = payload.display_name.trim();
    updates.canonical_name = normalizePersonName(payload.display_name);
  }
  if (payload.email !== undefined) updates.email = payload.email;
  if (payload.phone !== undefined) updates.phone = payload.phone;
  if (payload.status !== undefined) updates.status = payload.status;
  if (payload.notes !== undefined) updates.notes = payload.notes;

  const { error } = await supabase
    .from('company_people')
    .update(updates)
    .eq('id', personId)
    .eq('org_id', orgId);

  return !error;
}

export async function assignRoles(
  orgId: string,
  personId: string,
  roleKeys: string[],
  supabase: SupabaseClient,
): Promise<void> {
  // Ensure roles exist (upsert)
  for (const key of roleKeys) {
    const slug = toSlug(key);
    await supabase
      .from('company_roles')
      .upsert(
        { org_id: orgId, key: slug, label: key.trim() },
        { onConflict: 'org_id,key', ignoreDuplicates: true },
      );
  }

  // Get role IDs
  const { data: roles } = await supabase
    .from('company_roles')
    .select('id, key')
    .eq('org_id', orgId)
    .in('key', roleKeys.map(toSlug));

  if (!roles) return;

  const assignments = (roles as { id: string; key: string }[]).map((r) => ({
    org_id: orgId,
    person_id: personId,
    role_id: r.id,
  }));

  if (assignments.length > 0) {
    await supabase
      .from('company_role_assignments')
      .upsert(assignments, { onConflict: 'person_id,role_id', ignoreDuplicates: true });
  }
}

export async function setTags(
  orgId: string,
  personId: string,
  tagSlugs: string[],
  supabase: SupabaseClient,
): Promise<void> {
  // Ensure tags exist (upsert)
  for (const raw of tagSlugs) {
    const slug = toSlug(raw);
    await supabase
      .from('company_tags')
      .upsert(
        { org_id: orgId, slug, label: raw.trim() },
        { onConflict: 'org_id,slug', ignoreDuplicates: true },
      );
  }

  // Get tag IDs
  const { data: tags } = await supabase
    .from('company_tags')
    .select('id, slug')
    .eq('org_id', orgId)
    .in('slug', tagSlugs.map(toSlug));

  if (!tags) return;

  // Remove old tags, then insert new
  await supabase
    .from('company_tag_assignments')
    .delete()
    .eq('person_id', personId)
    .eq('org_id', orgId);

  const assignments = (tags as { id: string; slug: string }[]).map((t) => ({
    org_id: orgId,
    person_id: personId,
    tag_id: t.id,
  }));

  if (assignments.length > 0) {
    await supabase
      .from('company_tag_assignments')
      .insert(assignments);
  }
}

export async function addAlias(
  orgId: string,
  personId: string,
  alias: string,
  supabase: SupabaseClient,
): Promise<boolean> {
  const canonical = normalizePersonName(alias);
  const { error } = await supabase
    .from('company_person_aliases')
    .upsert(
      { org_id: orgId, person_id: personId, alias: alias.trim(), canonical_alias: canonical },
      { onConflict: 'org_id,canonical_alias', ignoreDuplicates: true },
    );

  return !error;
}

export async function removeAlias(
  orgId: string,
  aliasId: string,
  supabase: SupabaseClient,
): Promise<boolean> {
  const { error } = await supabase
    .from('company_person_aliases')
    .delete()
    .eq('id', aliasId)
    .eq('org_id', orgId);

  return !error;
}

// ── Staff roster import ───────────────────────────────────────────────

/** Header patterns for detecting name, role, and tag columns in staff rosters. */
const ROSTER_NAME_PATTERNS = [
  /^(full.?)?name$/i,
  /^instructor(s)?$/i,
  /^staff$/i,
  /^employee(s)?$/i,
  /^team.?member(s)?$/i,
  /^worker(s)?$/i,
  /^first.?name$/i,
  /^person$/i,
];

const ROSTER_ROLE_PATTERNS = [
  /^role(s)?$/i,
  /^position$/i,
  /^title$/i,
  /^job.?title$/i,
];

const ROSTER_TAG_PATTERNS = [
  /^tag(s)?$/i,
  /^discipline(s)?$/i,
  /^department(s)?$/i,
  /^category$/i,
  /^label(s)?$/i,
  /^specialt(y|ies)$/i,
];

const ROSTER_EMAIL_PATTERNS = [
  /^e.?mail$/i,
  /^email.?address$/i,
];

const ROSTER_PHONE_PATTERNS = [
  /^phone$/i,
  /^mobile$/i,
  /^tel$/i,
  /^phone.?number$/i,
];

function findColumn(headers: string[], patterns: RegExp[]): string | null {
  for (const h of headers) {
    if (patterns.some((p) => p.test(h.trim()))) return h;
  }
  return null;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export async function importRoster(
  orgId: string,
  rows: Record<string, unknown>[],
  headers: string[],
  supabase: SupabaseClient,
): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  const nameCol = findColumn(headers, ROSTER_NAME_PATTERNS);
  if (!nameCol) {
    // Fallback: try first column with text-like values
    for (const h of headers) {
      const vals = rows.slice(0, 20).map((r) => r[h]);
      const textCount = vals.filter(
        (v) => typeof v === 'string' && v.trim().length > 1 && /^[a-zA-Z\s\-'.]+$/.test(v.trim()),
      ).length;
      if (textCount > vals.length * 0.5) {
        return importRosterWithColumns(orgId, rows, h, findColumn(headers, ROSTER_ROLE_PATTERNS), findColumn(headers, ROSTER_TAG_PATTERNS), findColumn(headers, ROSTER_EMAIL_PATTERNS), findColumn(headers, ROSTER_PHONE_PATTERNS), supabase, result);
      }
    }
    result.errors.push('Could not detect a name column in the roster.');
    return result;
  }

  const roleCol = findColumn(headers, ROSTER_ROLE_PATTERNS);
  const tagCol = findColumn(headers, ROSTER_TAG_PATTERNS);
  const emailCol = findColumn(headers, ROSTER_EMAIL_PATTERNS);
  const phoneCol = findColumn(headers, ROSTER_PHONE_PATTERNS);

  return importRosterWithColumns(orgId, rows, nameCol, roleCol, tagCol, emailCol, phoneCol, supabase, result);
}

async function importRosterWithColumns(
  orgId: string,
  rows: Record<string, unknown>[],
  nameCol: string,
  roleCol: string | null,
  tagCol: string | null,
  emailCol: string | null,
  phoneCol: string | null,
  supabase: SupabaseClient,
  result: ImportResult,
): Promise<ImportResult> {
  for (const row of rows) {
    const rawName = String(row[nameCol] ?? '').trim();
    if (!rawName) {
      result.skipped++;
      continue;
    }

    const canonical = normalizePersonName(rawName);

    // Check if person exists (upsert logic)
    const { data: existing } = await supabase
      .from('company_people')
      .select('id')
      .eq('org_id', orgId)
      .eq('canonical_name', canonical)
      .maybeSingle();

    if (existing) {
      // Update existing person
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (emailCol && row[emailCol]) updates.email = String(row[emailCol]).trim();
      if (phoneCol && row[phoneCol]) updates.phone = String(row[phoneCol]).trim();

      await supabase
        .from('company_people')
        .update(updates)
        .eq('id', (existing as { id: string }).id)
        .eq('org_id', orgId);

      const personId = (existing as { id: string }).id;

      // Assign role if present
      if (roleCol && row[roleCol]) {
        const roleVal = String(row[roleCol]).trim();
        if (roleVal) await assignRoles(orgId, personId, [roleVal], supabase);
      }

      // Assign tag if present
      if (tagCol && row[tagCol]) {
        const tagVal = String(row[tagCol]).trim();
        if (tagVal) {
          const tagList = tagVal.split(/[,;|]/).map((t) => t.trim()).filter(Boolean);
          if (tagList.length > 0) await setTags(orgId, personId, tagList, supabase);
        }
      }

      result.updated++;
    } else {
      // Create new person
      const roleKeys: string[] = [];
      if (roleCol && row[roleCol]) {
        const rv = String(row[roleCol]).trim();
        if (rv) roleKeys.push(rv);
      }

      const tagSlugs: string[] = [];
      if (tagCol && row[tagCol]) {
        const tv = String(row[tagCol]).trim();
        if (tv) tagSlugs.push(...tv.split(/[,;|]/).map((t) => t.trim()).filter(Boolean));
      }

      const person = await createPerson(orgId, {
        display_name: rawName,
        email: emailCol && row[emailCol] ? String(row[emailCol]).trim() : null,
        phone: phoneCol && row[phoneCol] ? String(row[phoneCol]).trim() : null,
        source: 'upload',
        role_keys: roleKeys,
        tag_slugs: tagSlugs,
      }, supabase);

      if (person) {
        result.created++;
      } else {
        result.errors.push(`Failed to create: ${rawName}`);
      }
    }
  }

  return result;
}

// ── Actor resolution (ingestion hook) ─────────────────────────────────

/**
 * Load all staff names + aliases from the Company Directory for an org.
 * Returns a Set of canonical names for fast lookup during role inference.
 * This replaces/augments the legacy staff_roster_overrides lookup.
 */
export async function loadStaffNamesFromDirectory(
  orgId: string,
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const names = new Set<string>();

  // Active people's canonical names
  const { data: people } = await supabase
    .from('company_people')
    .select('canonical_name')
    .eq('org_id', orgId)
    .eq('status', 'active');

  for (const p of (people ?? []) as { canonical_name: string }[]) {
    if (p.canonical_name) names.add(p.canonical_name);
  }

  // All aliases for active people
  const { data: aliases } = await supabase
    .from('company_person_aliases')
    .select('canonical_alias, company_people!inner(status)')
    .eq('org_id', orgId);

  for (const a of (aliases ?? []) as unknown as { canonical_alias: string; company_people: { status: string } }[]) {
    if (a.canonical_alias && a.company_people?.status === 'active') {
      names.add(a.canonical_alias);
    }
  }

  return names;
}

/**
 * Resolve an actor name against the Company Directory.
 * Priority: exact canonical match → alias match → none.
 * (Fuzzy matching can be added later with pg_trgm.)
 */
export async function resolveActorName(
  orgId: string,
  actorName: string,
  supabase: SupabaseClient,
): Promise<ActorResolution> {
  const canonical = normalizePersonName(actorName);
  if (!canonical) return { matched: false, matchType: 'none', person: null, confidence: 0 };

  // 1. Exact canonical match on company_people
  const { data: exactMatch } = await supabase
    .from('company_people')
    .select('*')
    .eq('org_id', orgId)
    .eq('canonical_name', canonical)
    .eq('status', 'active')
    .maybeSingle();

  if (exactMatch) {
    return {
      matched: true,
      matchType: 'exact',
      person: exactMatch as unknown as CompanyPerson,
      confidence: 1.0,
    };
  }

  // 2. Alias match
  const { data: aliasMatch } = await supabase
    .from('company_person_aliases')
    .select('person_id, company_people!inner(*)')
    .eq('org_id', orgId)
    .eq('canonical_alias', canonical)
    .maybeSingle();

  if (aliasMatch) {
    return {
      matched: true,
      matchType: 'alias',
      person: (aliasMatch as Record<string, unknown>).company_people as unknown as CompanyPerson,
      confidence: 0.95,
    };
  }

  return { matched: false, matchType: 'none', person: null, confidence: 0 };
}

// ── Roles & tags listing ──────────────────────────────────────────────

export async function listRoles(orgId: string, supabase: SupabaseClient): Promise<CompanyRole[]> {
  const { data } = await supabase
    .from('company_roles')
    .select('*')
    .eq('org_id', orgId)
    .order('label');

  return (data ?? []) as CompanyRole[];
}

export async function listTags(orgId: string, supabase: SupabaseClient): Promise<CompanyTag[]> {
  const { data } = await supabase
    .from('company_tags')
    .select('*')
    .eq('org_id', orgId)
    .order('label');

  return (data ?? []) as CompanyTag[];
}
