// Ontology hook: fetch and CRUD for entity types, entities, relationship types, and relationships.
'use client';

import { useCallback, useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import type {
  Entity,
  EntityProperty,
  EntityRelationship,
  EntityType,
  RelationshipType,
} from '@/types/domain';
import { useUser } from '@/hooks/use-user';

export function useOntology(): {
  entityTypes: EntityType[];
  entities: Entity[];
  relationshipTypes: RelationshipType[];
  relationships: EntityRelationship[];
  isLoading: boolean;
  refetch: () => Promise<void>;
  createEntityType: (input: {
    name: string;
    slug: string;
    description?: string | null;
    icon?: string;
    color?: string;
    properties?: EntityProperty[];
  }) => Promise<EntityType | null>;
  updateEntityType: (
    id: string,
    input: Partial<{
      name: string;
      slug: string;
      description: string | null;
      icon: string;
      color: string;
      properties: EntityProperty[];
    }>,
  ) => Promise<EntityType | null>;
  deleteEntityType: (id: string) => Promise<boolean>;
  createEntity: (input: {
    entity_type_id: string;
    name: string;
    properties?: Record<string, unknown>;
    source_upload_id?: string | null;
  }) => Promise<Entity | null>;
  updateEntity: (
    id: string,
    input: Partial<{ name: string; properties: Record<string, unknown> }>,
  ) => Promise<Entity | null>;
  deleteEntity: (id: string) => Promise<boolean>;
  createRelationshipType: (input: {
    name: string;
    from_type_id: string;
    to_type_id: string;
    description?: string | null;
  }) => Promise<RelationshipType | null>;
  createRelationship: (input: {
    relationship_type_id: string;
    from_entity_id: string;
    to_entity_id: string;
    properties?: Record<string, unknown>;
  }) => Promise<EntityRelationship | null>;
} {
  const { org } = useUser();
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [relationshipTypes, setRelationshipTypes] = useState<RelationshipType[]>([]);
  const [relationships, setRelationships] = useState<EntityRelationship[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!org?.id) {
      setEntityTypes([]);
      setEntities([]);
      setRelationshipTypes([]);
      setRelationships([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const supabase = createClient();

    const [etRes, eRes, rtRes, rRes] = await Promise.all([
      supabase.from('entity_types').select('*').eq('org_id', org.id).order('created_at', { ascending: true }),
      supabase.from('entities').select('*').eq('org_id', org.id).order('created_at', { ascending: true }),
      supabase.from('relationship_types').select('*').eq('org_id', org.id).order('created_at', { ascending: true }),
      supabase.from('entity_relationships').select('*').eq('org_id', org.id).order('created_at', { ascending: true }),
    ]);

    setEntityTypes((etRes.data ?? []) as EntityType[]);
    setEntities((eRes.data ?? []) as Entity[]);
    setRelationshipTypes((rtRes.data ?? []) as RelationshipType[]);
    setRelationships((rRes.data ?? []) as EntityRelationship[]);
    setIsLoading(false);
  }, [org?.id]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const createEntityType = useCallback(
    async (input: {
      name: string;
      slug: string;
      description?: string | null;
      icon?: string;
      color?: string;
      properties?: EntityProperty[];
    }) => {
      if (!org?.id) return null;
      const supabase = createClient();
      const { data, error } = await supabase
        .from('entity_types')
        .insert({
          org_id: org.id,
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          icon: input.icon ?? 'circle',
          color: input.color ?? '#10B981',
          properties: input.properties ?? [],
        })
        .select()
        .single();
      if (error) return null;
      await fetchAll();
      return data as EntityType;
    },
    [org?.id, fetchAll],
  );

  const updateEntityType = useCallback(
    async (
      id: string,
      input: Partial<{
        name: string;
        slug: string;
        description: string | null;
        icon: string;
        color: string;
        properties: EntityProperty[];
      }>,
    ) => {
      if (!org?.id) return null;
      const supabase = createClient();
      const { data, error } = await supabase
        .from('entity_types')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('org_id', org.id)
        .select()
        .single();
      if (error) return null;
      await fetchAll();
      return data as EntityType;
    },
    [org?.id, fetchAll],
  );

  const deleteEntityType = useCallback(
    async (id: string) => {
      if (!org?.id) return false;
      const supabase = createClient();
      const { error } = await supabase.from('entity_types').delete().eq('id', id).eq('org_id', org.id);
      if (error) return false;
      await fetchAll();
      return true;
    },
    [org?.id, fetchAll],
  );

  const createEntity = useCallback(
    async (input: {
      entity_type_id: string;
      name: string;
      properties?: Record<string, unknown>;
      source_upload_id?: string | null;
    }) => {
      if (!org?.id) return null;
      const supabase = createClient();
      const { data, error } = await supabase
        .from('entities')
        .insert({
          org_id: org.id,
          entity_type_id: input.entity_type_id,
          name: input.name,
          properties: input.properties ?? {},
          source_upload_id: input.source_upload_id ?? null,
        })
        .select()
        .single();
      if (error) return null;
      await fetchAll();
      return data as Entity;
    },
    [org?.id, fetchAll],
  );

  const updateEntity = useCallback(
    async (
      id: string,
      input: Partial<{ name: string; properties: Record<string, unknown> }>,
    ) => {
      if (!org?.id) return null;
      const supabase = createClient();
      const { data, error } = await supabase
        .from('entities')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('org_id', org.id)
        .select()
        .single();
      if (error) return null;
      await fetchAll();
      return data as Entity;
    },
    [org?.id, fetchAll],
  );

  const deleteEntity = useCallback(
    async (id: string) => {
      if (!org?.id) return false;
      const supabase = createClient();
      await supabase
        .from('entity_relationships')
        .delete()
        .eq('org_id', org.id)
        .or(`from_entity_id.eq.${id},to_entity_id.eq.${id}`);
      const { error } = await supabase.from('entities').delete().eq('id', id).eq('org_id', org.id);
      if (error) return false;
      await fetchAll();
      return true;
    },
    [org?.id, fetchAll],
  );

  const createRelationshipType = useCallback(
    async (input: {
      name: string;
      from_type_id: string;
      to_type_id: string;
      description?: string | null;
    }) => {
      if (!org?.id) return null;
      const supabase = createClient();
      const { data, error } = await supabase
        .from('relationship_types')
        .insert({
          org_id: org.id,
          name: input.name,
          from_type_id: input.from_type_id,
          to_type_id: input.to_type_id,
          description: input.description ?? null,
        })
        .select()
        .single();
      if (error) return null;
      await fetchAll();
      return data as RelationshipType;
    },
    [org?.id, fetchAll],
  );

  const createRelationship = useCallback(
    async (input: {
      relationship_type_id: string;
      from_entity_id: string;
      to_entity_id: string;
      properties?: Record<string, unknown>;
    }) => {
      if (!org?.id) return null;
      const supabase = createClient();
      const { data, error } = await supabase
        .from('entity_relationships')
        .insert({
          org_id: org.id,
          relationship_type_id: input.relationship_type_id,
          from_entity_id: input.from_entity_id,
          to_entity_id: input.to_entity_id,
          properties: input.properties ?? {},
        })
        .select()
        .single();
      if (error) return null;
      await fetchAll();
      return data as EntityRelationship;
    },
    [org?.id, fetchAll],
  );

  return {
    entityTypes,
    entities,
    relationshipTypes,
    relationships,
    isLoading,
    refetch: fetchAll,
    createEntityType,
    updateEntityType,
    deleteEntityType,
    createEntity,
    updateEntity,
    deleteEntity,
    createRelationshipType,
    createRelationship,
  };
}
