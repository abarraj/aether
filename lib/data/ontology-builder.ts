/**
 * Builds the ontology in the database from detection results: entity types,
 * entities with computed aggregated properties, and relationships.
 */

import { createClient } from '@/lib/supabase/server';
import type {
  DetectedEntityType,
  DetectedRelationship,
  OntologyDetection,
} from '@/lib/ai/ontology-detector';
import type { EntityProperty } from '@/types/domain';

function toEntityProperties(aggregated: DetectedEntityType['aggregatedProperties']): EntityProperty[] {
  return aggregated.map((p) => ({
    key: p.key,
    label: p.label,
    type: p.type,
  }));
}

function toNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const n = Number(String(v).replace(/[,$%]/g, ''));
  return Number.isNaN(n) ? null : n;
}

export async function buildOntologyFromDetection(
  orgId: string,
  uploadId: string,
  detection: OntologyDetection,
  rows: Record<string, unknown>[],
): Promise<{ entityTypesCreated: number; entitiesCreated: number; relationshipsCreated: number }> {
  const supabase = await createClient();
  let entityTypesCreated = 0;
  let entitiesCreated = 0;
  let relationshipsCreated = 0;

  const slugToTypeId = new Map<string, string>();

  // Step 1 — Create entity types (skip if slug already exists)
  for (const et of detection.entityTypes) {
    const { data: existing } = await supabase
      .from('entity_types')
      .select('id')
      .eq('org_id', orgId)
      .eq('slug', et.slug)
      .maybeSingle<{ id: string }>();

    if (existing) {
      slugToTypeId.set(et.slug, existing.id);
      // Update source_column if not set
      if (et.sourceColumn) {
        await supabase
          .from('entity_types')
          .update({ source_column: et.sourceColumn })
          .eq('id', existing.id)
          .is('source_column', null);
      }
      continue;
    }

    const { data: inserted, error } = await supabase
      .from('entity_types')
      .insert({
        org_id: orgId,
        name: et.name,
        slug: et.slug,
        icon: et.icon,
        color: et.color,
        properties: toEntityProperties(et.aggregatedProperties),
        source_column: et.sourceColumn,
      })
      .select('id')
      .single<{ id: string }>();

    if (error || !inserted) continue;
    slugToTypeId.set(et.slug, inserted.id);
    entityTypesCreated++;
  }

  // Step 2 — Entities with aggregated properties
  type EntityRow = { id: string; entity_type_id: string; name: string; properties: Record<string, unknown> };
  const existingEntitiesByTypeAndName = new Map<string, EntityRow>();
  const { data: existingEntities } = await supabase
    .from('entities')
    .select('id, entity_type_id, name, properties')
    .eq('org_id', orgId)
    .returns<EntityRow[]>();

  for (const e of existingEntities ?? []) {
    const key = `${e.entity_type_id}:${(e.name ?? '').trim().toLowerCase()}`;
    existingEntitiesByTypeAndName.set(key, e);
  }

  for (const et of detection.entityTypes) {
    const typeId = slugToTypeId.get(et.slug);
    if (!typeId) continue;

    const sourceCol = et.sourceColumn;
    const valueToRows = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) {
      const raw = row[sourceCol];
      const val = raw != null ? String(raw).trim() : '';
      if (!val) continue;
      if (!valueToRows.has(val)) valueToRows.set(val, []);
      valueToRows.get(val)!.push(row);
    }

    for (const [entityName, entityRows] of valueToRows) {
      const props: Record<string, number> = {};
      for (const prop of et.aggregatedProperties) {
        const col = prop.sourceColumn;
        const values = entityRows
          .map((r) => toNumber(r[col]))
          .filter((n): n is number => n !== null);
        let computed: number;
        if (prop.aggregation === 'sum') {
          computed = values.reduce((a, b) => a + b, 0);
        } else if (prop.aggregation === 'average') {
          computed = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
          computed = Math.round(computed * 100) / 100;
        } else if (prop.aggregation === 'count') {
          computed = values.length;
        } else if (prop.aggregation === 'min') {
          computed = values.length ? Math.min(...values) : 0;
        } else if (prop.aggregation === 'max') {
          computed = values.length ? Math.max(...values) : 0;
        } else {
          computed = 0;
        }
        props[prop.key] = computed;
      }

      const key = `${typeId}:${entityName.toLowerCase()}`;
      const existing = existingEntitiesByTypeAndName.get(key);

      if (existing) {
        const current = existing.properties ?? {};
        const merged = { ...current, ...props };
        await supabase
          .from('entities')
          .update({
            properties: merged,
            source_upload_id: uploadId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        const { data: inserted } = await supabase
          .from('entities')
          .insert({
            org_id: orgId,
            entity_type_id: typeId,
            name: entityName,
            properties: props,
            source_upload_id: uploadId,
          })
          .select('id')
          .single<{ id: string }>();

        if (inserted) {
          entitiesCreated++;
          existingEntitiesByTypeAndName.set(key, {
            id: inserted.id,
            entity_type_id: typeId,
            name: entityName,
            properties: props,
          });
        }
      }
    }
  }

  // Refresh entity id by name for relationship creation (we need entity ids by type and name)
  const { data: allEntities } = await supabase
    .from('entities')
    .select('id, entity_type_id, name')
    .eq('org_id', orgId);

  const entityIdByTypeAndName = new Map<string, string>();
  for (const e of allEntities ?? []) {
    const k = `${e.entity_type_id}:${(e.name ?? '').trim().toLowerCase()}`;
    entityIdByTypeAndName.set(k, e.id);
  }

  const relTypeCache = new Map<string, string>();
  const existingRels = new Set<string>();

  const { data: existingRelRows } = await supabase
    .from('entity_relationships')
    .select('relationship_type_id, from_entity_id, to_entity_id')
    .eq('org_id', orgId);

  for (const r of existingRelRows ?? []) {
    existingRels.add(`${r.relationship_type_id}:${r.from_entity_id}:${r.to_entity_id}`);
  }

  // Step 3 — Relationship types and entity relationships
  for (const rel of detection.relationships) {
    const fromTypeId = slugToTypeId.get(rel.fromTypeSlug);
    const toTypeId = slugToTypeId.get(rel.toTypeSlug);
    if (!fromTypeId || !toTypeId) continue;

    let relTypeId = relTypeCache.get(`${rel.name}:${fromTypeId}:${toTypeId}`);
    if (!relTypeId) {
      const { data: existingRelType } = await supabase
        .from('relationship_types')
        .select('id')
        .eq('org_id', orgId)
        .eq('name', rel.name)
        .eq('from_type_id', fromTypeId)
        .eq('to_type_id', toTypeId)
        .maybeSingle<{ id: string }>();

      if (existingRelType) {
        relTypeId = existingRelType.id;
      } else {
        const { data: inserted } = await supabase
          .from('relationship_types')
          .insert({
            org_id: orgId,
            name: rel.name,
            from_type_id: fromTypeId,
            to_type_id: toTypeId,
          })
          .select('id')
          .single<{ id: string }>();
        if (!inserted) continue;
        relTypeId = inserted.id;
      }
      relTypeCache.set(`${rel.name}:${fromTypeId}:${toTypeId}`, relTypeId);
    }

    const fromCol = detection.entityTypes.find((et) => et.slug === rel.fromTypeSlug)?.sourceColumn ?? '';
    const toCol = detection.entityTypes.find((et) => et.slug === rel.toTypeSlug)?.sourceColumn ?? '';
    if (!fromCol || !toCol) continue;

    const seen = new Set<string>();
    for (const row of rows) {
      const fromVal = row[fromCol] != null ? String(row[fromCol]).trim() : '';
      const toVal = row[toCol] != null ? String(row[toCol]).trim() : '';
      if (!fromVal || !toVal) continue;
      const pairKey = `${fromVal.toLowerCase()}:${toVal.toLowerCase()}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      const fromEntityId = entityIdByTypeAndName.get(`${fromTypeId}:${fromVal.toLowerCase()}`);
      const toEntityId = entityIdByTypeAndName.get(`${toTypeId}:${toVal.toLowerCase()}`);
      if (!fromEntityId || !toEntityId) continue;

      const tripleKey = `${relTypeId}:${fromEntityId}:${toEntityId}`;
      if (existingRels.has(tripleKey)) continue;

      const { error } = await supabase.from('entity_relationships').insert({
        org_id: orgId,
        relationship_type_id: relTypeId,
        from_entity_id: fromEntityId,
        to_entity_id: toEntityId,
      });
      if (!error) {
        relationshipsCreated++;
        existingRels.add(tripleKey);
      }
    }
  }

  return { entityTypesCreated, entitiesCreated, relationshipsCreated };
}
