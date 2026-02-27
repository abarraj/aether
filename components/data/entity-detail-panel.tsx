'use client';

import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ChevronRight } from 'lucide-react';

import type {
  Entity,
  EntityRelationship,
  EntityType,
  RelationshipType,
  PropertyType,
} from '@/types/domain';
import { cn } from '@/lib/utils';

interface EntityDetailPanelProps {
  entity: Entity | null;
  entityType: EntityType | null;
  allEntities: Entity[];
  allRelationshipTypes: RelationshipType[];
  allEntityRelationships: EntityRelationship[];
  allEntityTypes: EntityType[];
  onClose: () => void;
  onSelectEntity: (entityId: string) => void;
}

function formatValue(value: unknown, type: PropertyType): string {
  if (value == null || value === '') return '—';
  if (type === 'currency') {
    const n =
      typeof value === 'number'
        ? value
        : Number(String(value).replace(/[,$%]/g, ''));
    return Number.isNaN(n)
      ? String(value)
      : new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        }).format(n);
  }
  if (type === 'percentage') {
    const n =
      typeof value === 'number'
        ? value
        : Number(String(value).replace(/[%]/g, ''));
    return Number.isNaN(n) ? String(value) : `${n.toFixed(1)}%`;
  }
  if (type === 'number') {
    const n =
      typeof value === 'number'
        ? value
        : Number(String(value).replace(/[,]/g, ''));
    return Number.isNaN(n)
      ? String(value)
      : new Intl.NumberFormat('en-US', {
          maximumFractionDigits: n % 1 === 0 ? 0 : 1,
        }).format(n);
  }
  return String(value);
}

export function EntityDetailPanel({
  entity,
  entityType,
  allEntities,
  allRelationshipTypes,
  allEntityRelationships,
  allEntityTypes,
  onClose,
  onSelectEntity,
}: EntityDetailPanelProps) {
  const [history, setHistory] = useState<Entity[]>([]);

  const properties = useMemo(() => {
    if (!entity || !entityType) return [];
    const entries = Object.entries(entity.properties ?? {}).map(
      ([key, value]) => {
        const def = entityType.properties.find((p) => p.key === key);
        const type = (def?.type ?? 'text') as PropertyType;
        const label = def?.label ?? key;
        let numeric: number | null = null;
        if (type === 'currency' || type === 'number' || type === 'percentage') {
          const raw =
            typeof value === 'number'
              ? value
              : Number(String(value).replace(/[,$%]/g, ''));
          numeric = Number.isNaN(raw) ? null : raw;
        }
        return { key, label, type, value, numeric };
      },
    );
    entries.sort((a, b) => {
      if (a.numeric == null || b.numeric == null) return 0;
      return (b.numeric ?? 0) - (a.numeric ?? 0);
    });
    return entries;
  }, [entity, entityType]);

  const primaryKey = properties[0]?.key ?? null;

  const relationshipsByType = useMemo(() => {
    if (!entity) return [];
    const relsForEntity = allEntityRelationships.filter(
      (rel) =>
        rel.from_entity_id === entity.id || rel.to_entity_id === entity.id,
    );
    const map = new Map<
      string,
      { type: RelationshipType; items: { target: Entity }[] }
    >();
    for (const rel of relsForEntity) {
      const type = allRelationshipTypes.find(
        (rt) => rt.id === rel.relationship_type_id,
      );
      if (!type) continue;
      const targetId =
        rel.from_entity_id === entity.id ? rel.to_entity_id : rel.from_entity_id;
      const target = allEntities.find((e) => e.id === targetId);
      if (!target) continue;
      const existing =
        map.get(type.id) ?? { type, items: [] as { target: Entity }[] };
      existing.items.push({ target });
      map.set(type.id, existing);
    }
    return Array.from(map.values());
  }, [entity, allEntityRelationships, allRelationshipTypes, allEntities]);

  const handleSelectTarget = (target: Entity) => {
    if (!entity || target.id === entity.id) return;
    setHistory((prev) => [...prev, entity]);
    onSelectEntity(target.id);
  };

  const handleBack = () => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const last = next.pop()!;
      onSelectEntity(last.id);
      return next;
    });
  };

  const backTarget = history[history.length - 1] ?? null;

  return (
    <AnimatePresence>
      {entity && entityType && (
        <>
          <motion.div
            key="entity-detail-panel"
            initial={{ x: 480, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 480, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed right-0 top-0 z-50 h-full w-[480px] flex flex-col border-l border-zinc-800 bg-[#0A0A0A] shadow-[0_0_40px_rgba(0,0,0,0.75)]"
          >
            <div className="shrink-0 border-b border-zinc-800 bg-[#0A0A0A] px-6 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-semibold text-black"
                    style={{ backgroundColor: entityType.color }}
                  >
                    {entity.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xl font-semibold tracking-tight text-slate-100">
                      {entity.name}
                    </div>
                    <div className="text-xs text-slate-400">{entityType.name}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full p-1 text-slate-400 hover:bg-zinc-900 hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {backTarget && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="mt-3 inline-flex items-center gap-1 rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-[11px] text-slate-300 hover:bg-zinc-900"
                >
                  ← Back to {backTarget.name}
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto pb-6">
              {/* Properties */}
              <section className="px-6 py-5">
                <div className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  Properties
                </div>
                {properties.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 px-4 py-3 text-xs text-slate-500">
                    No properties yet for this entity.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {properties.map((prop) => (
                      <div
                        key={prop.key}
                        className={cn(
                          'rounded-2xl border border-zinc-800/50 bg-zinc-950 p-3',
                          prop.key === primaryKey &&
                            'sm:col-span-2 border-l-2 border-l-emerald-500/50',
                        )}
                      >
                        <div className="text-[11px] font-medium text-slate-500">
                          {prop.label}
                        </div>
                        <div className="mt-1 text-base font-semibold text-slate-100">
                          {formatValue(prop.value, prop.type)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Connections */}
              <section className="border-t border-zinc-800 px-6 py-5">
                <div className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  Connections
                </div>
                {relationshipsByType.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 px-4 py-3 text-xs text-slate-500">
                    No connections yet for this entity.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {relationshipsByType.map((group) => {
                      const relName = group.type.name.replace(/_/g, ' ');
                      return (
                        <div key={group.type.id} className="space-y-2">
                          <div className="text-xs font-medium text-slate-400">
                            {relName.charAt(0).toUpperCase() + relName.slice(1)}
                          </div>
                          <div className="space-y-1.5">
                            {group.items.map(({ target }) => {
                              const targetType = allEntityTypes.find(
                                (t) => t.id === target.entity_type_id,
                              );
                              return (
                                <button
                                  key={target.id}
                                  type="button"
                                  onClick={() => handleSelectTarget(target)}
                                  className="flex w-full items-center gap-3 rounded-2xl bg-zinc-900/50 px-3 py-2.5 text-left text-sm text-slate-200 transition hover:bg-zinc-900"
                                >
                                  <div
                                    className="flex h-7 w-7 items-center justify-center rounded-xl text-[11px] font-semibold text-black"
                                    style={{
                                      backgroundColor:
                                        targetType?.color ?? 'rgba(148,163,184,0.5)',
                                    }}
                                  >
                                    {target.name.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate font-medium">
                                      {target.name}
                                    </div>
                                    {targetType && (
                                      <div className="truncate text-[11px] text-slate-500">
                                        {targetType.name}
                                      </div>
                                    )}
                                  </div>
                                  <ChevronRight className="h-4 w-4 text-slate-500" />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Source */}
              <section className="border-t border-zinc-800 px-6 py-5">
                <div className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  Source
                </div>
                {entity.source_upload_id ? (
                  <div className="space-y-1 text-xs text-slate-400">
                    <div>Auto-detected from uploaded data.</div>
                    <div>
                      Created at{' '}
                      {new Date(entity.created_at).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400">Manually created.</div>
                )}
              </section>
            </div>
          </motion.div>

          <motion.div
            key="entity-detail-backdrop"
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
        </>
      )}
    </AnimatePresence>
  );
}

