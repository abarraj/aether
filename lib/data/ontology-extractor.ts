// Server-only: extract entities and relationships from upload data using ontology mapping.

import { createClient } from '@/lib/supabase/server';

export interface OntologyMapping {
  entityTypeId: string;
  nameColumn: string;
  columnToProperty: Record<string, string>;
  relationshipColumns?: {
    column: string;
    toEntityTypeId: string;
    relationshipName: string;
  }[];
}

interface DataRowRecord {
  id: string;
  data: Record<string, unknown>;
}

/**
 * Creates entities from unique values in the name column and sets properties from
 * mapped columns. Detects relationships when a column value matches an existing
 * entity name of another type.
 */
export async function extractEntities(
  orgId: string,
  uploadId: string,
  mapping: OntologyMapping,
): Promise<{ entitiesCreated: number; relationshipsCreated: number }> {
  const supabase = await createClient();

  const { data: rows, error: rowsError } = await supabase
    .from('data_rows')
    .select('id, data')
    .eq('org_id', orgId)
    .eq('upload_id', uploadId)
    .returns<DataRowRecord[]>();

  if (rowsError || !rows?.length) {
    return { entitiesCreated: 0, relationshipsCreated: 0 };
  }

  const nameCol = mapping.nameColumn;
  const propMap = mapping.columnToProperty ?? {};
  const relCols = mapping.relationshipColumns ?? [];

  // Unique entity names (first row wins for properties)
  const nameToRow = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const raw = row.data as Record<string, string>;
    const name = raw[nameCol]?.trim();
    if (!name) continue;
    if (!nameToRow.has(name)) {
      nameToRow.set(name, raw);
    }
  }

  // Fetch entity type to ensure it exists and get org
  const { data: entityType } = await supabase
    .from('entity_types')
    .select('id')
    .eq('id', mapping.entityTypeId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (!entityType) {
    return { entitiesCreated: 0, relationshipsCreated: 0 };
  }

  // Existing entities of this type (by name, lowercase) to avoid duplicates
  const { data: existingEntities } = await supabase
    .from('entities')
    .select('id, name')
    .eq('org_id', orgId)
    .eq('entity_type_id', mapping.entityTypeId);

  const existingByName = new Map<string, string>(
    (existingEntities ?? []).map((e) => [e.name.trim().toLowerCase(), e.id]),
  );

  let entitiesCreated = 0;

  for (const [name, row] of nameToRow) {
    const key = name.toLowerCase();
    let entityId = existingByName.get(key);

    if (!entityId) {
      const properties: Record<string, unknown> = {};
      for (const [col, propKey] of Object.entries(propMap)) {
        if (col === nameCol) continue;
        const val = row[col];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          properties[propKey] = val;
        }
      }

      const { data: created, error } = await supabase
        .from('entities')
        .insert({
          org_id: orgId,
          entity_type_id: mapping.entityTypeId,
          name,
          properties,
          source_upload_id: uploadId,
        })
        .select('id')
        .single();

      if (!error && created) {
        entityId = created.id;
        existingByName.set(key, entityId);
        entitiesCreated++;
      }
    }
  }

  // Relationships: for each relationship column, load target entities by name
  let relationshipsCreated = 0;

  for (const rel of relCols) {
    const toTypeId = rel.toEntityTypeId;
    const relName = rel.relationshipName || 'references';
    const col = rel.column;

    const { data: toEntities } = await supabase
      .from('entities')
      .select('id, name')
      .eq('org_id', orgId)
      .eq('entity_type_id', toTypeId);

    const toEntityByName = new Map<string, string>(
      (toEntities ?? []).map((e) => [e.name.trim().toLowerCase(), e.id]),
    );

    // Get or create relationship type
    const { data: relType } = await supabase
      .from('relationship_types')
      .select('id')
      .eq('org_id', orgId)
      .eq('name', relName)
      .eq('from_type_id', mapping.entityTypeId)
      .eq('to_type_id', toTypeId)
      .maybeSingle();

    let relationshipTypeId: string | null = null;

    if (relType) {
      relationshipTypeId = relType.id;
    } else {
      const { data: createdRelType } = await supabase
        .from('relationship_types')
        .insert({
          org_id: orgId,
          name: relName,
          from_type_id: mapping.entityTypeId,
          to_type_id: toTypeId,
        })
        .select('id')
        .single();
      if (createdRelType) relationshipTypeId = createdRelType.id;
    }

    if (!relationshipTypeId) continue;

    // Existing relationships to avoid duplicates: (from_entity_id, to_entity_id, relationship_type_id)
    const { data: existingRels } = await supabase
      .from('entity_relationships')
      .select('from_entity_id, to_entity_id')
      .eq('org_id', orgId)
      .eq('relationship_type_id', relationshipTypeId);

    const existingSet = new Set(
      (existingRels ?? []).map((r) => `${r.from_entity_id}:${r.to_entity_id}`),
    );

    for (const row of rows) {
      const raw = row.data as Record<string, string>;
      const fromName = raw[nameCol]?.trim();
      const toName = raw[col]?.trim();
      if (!fromName || !toName) continue;

      const fromId = existingByName.get(fromName.toLowerCase());
      const toId = toEntityByName.get(toName.toLowerCase());
      if (!fromId || !toId) continue;

      const key = `${fromId}:${toId}`;
      if (existingSet.has(key)) continue;

      const { error: relErr } = await supabase.from('entity_relationships').insert({
        org_id: orgId,
        relationship_type_id: relationshipTypeId,
        from_entity_id: fromId,
        to_entity_id: toId,
      });

      if (!relErr) {
        existingSet.add(key);
        relationshipsCreated++;
      }
    }
  }

  return { entitiesCreated, relationshipsCreated };
}
