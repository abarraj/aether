'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  User,
  Building2,
  MapPin,
  Package,
  DollarSign,
  Calendar,
  Briefcase,
  GraduationCap,
  Heart,
  Truck,
  ShoppingCart,
  Coffee,
  Dumbbell,
  Music,
  Wrench,
  Zap,
  Star,
  Tag,
  Clock,
  BarChart3,
  Circle,
  Plus,
  Link2,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Check,
  Eye,
  EyeOff,
  Network,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { useOntology } from '@/hooks/use-ontology';
import type { Entity, EntityProperty, EntityType, PropertyType, RelationshipType } from '@/types/domain';
import { cn } from '@/lib/utils';

function formatPropertyValue(value: unknown, type: PropertyType): string {
  if (value == null) return '—';
  if (type === 'currency') {
    const n = typeof value === 'number' ? value : Number(String(value).replace(/[,$%]/g, ''));
    return Number.isNaN(n) ? String(value) : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  }
  if (type === 'percentage') {
    const n = typeof value === 'number' ? value : Number(String(value).replace(/[%]/g, ''));
    return Number.isNaN(n) ? String(value) : `${n.toFixed(1)}%`;
  }
  if (type === 'number') {
    const n = typeof value === 'number' ? value : Number(String(value).replace(/[,]/g, ''));
    return Number.isNaN(n) ? String(value) : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
  }
  return String(value);
}

function entityPropertiesSorted(entity: Entity, entityType: EntityType): { key: string; label: string; value: unknown; type: PropertyType }[] {
  const props = entityType.properties;
  const entries = Object.entries(entity.properties ?? {})
    .map(([key, value]) => {
      const def = props.find((p) => p.key === key);
      return { key, label: def?.label ?? key, value, type: (def?.type ?? 'text') as PropertyType };
    })
    .filter((p) => p.value != null && p.value !== '');
  entries.sort((a, b) => {
    const an = typeof a.value === 'number' ? a.value : Number(a.value);
    const bn = typeof b.value === 'number' ? b.value : Number(b.value);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return bn - an;
    return 0;
  });
  return entries;
}

function entityInlineSummary(entity: Entity, entityType: EntityType, max = 3): string {
  const sorted = entityPropertiesSorted(entity, entityType).slice(0, max);
  if (sorted.length === 0) return entity.name;
  const parts = sorted.map((p) => `${p.label}: ${formatPropertyValue(p.value, p.type)}`);
  return `${entity.name} — ${parts.join(' · ')}`;
}

const ICON_MAP: Record<string, LucideIcon> = {
  user: User,
  building2: Building2,
  mappin: MapPin,
  package: Package,
  dollarsign: DollarSign,
  calendar: Calendar,
  briefcase: Briefcase,
  graduationcap: GraduationCap,
  heart: Heart,
  truck: Truck,
  shoppingcart: ShoppingCart,
  coffee: Coffee,
  dumbbell: Dumbbell,
  music: Music,
  wrench: Wrench,
  zap: Zap,
  star: Star,
  tag: Tag,
  clock: Clock,
  barchart3: BarChart3,
  circle: Circle,
};

const ICON_PICKER_OPTIONS: { name: string; key: string }[] = [
  { name: 'User', key: 'user' },
  { name: 'Building', key: 'building2' },
  { name: 'Map Pin', key: 'mappin' },
  { name: 'Package', key: 'package' },
  { name: 'Dollar', key: 'dollarsign' },
  { name: 'Calendar', key: 'calendar' },
  { name: 'Briefcase', key: 'briefcase' },
  { name: 'Graduation', key: 'graduationcap' },
  { name: 'Heart', key: 'heart' },
  { name: 'Truck', key: 'truck' },
  { name: 'Cart', key: 'shoppingcart' },
  { name: 'Coffee', key: 'coffee' },
  { name: 'Dumbbell', key: 'dumbbell' },
  { name: 'Music', key: 'music' },
  { name: 'Wrench', key: 'wrench' },
  { name: 'Zap', key: 'zap' },
  { name: 'Star', key: 'star' },
  { name: 'Tag', key: 'tag' },
  { name: 'Clock', key: 'clock' },
  { name: 'Chart', key: 'barchart3' },
];

const COLOR_PRESETS = [
  { name: 'emerald', value: '#10B981' },
  { name: 'cyan', value: '#06B6D4' },
  { name: 'amber', value: '#F59E0B' },
  { name: 'rose', value: '#F43F5E' },
  { name: 'violet', value: '#8B5CF6' },
  { name: 'slate', value: '#64748B' },
];

const PROPERTY_TYPES: PropertyType[] = [
  'text',
  'number',
  'currency',
  'percentage',
  'date',
  'boolean',
  'email',
  'url',
];

function slugFromLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'field';
}

// ----- Graph layout: circular positions for entity types
function useGraphLayout(entityTypes: EntityType[]) {
  const NODE_WIDTH = 200;
  const NODE_HEIGHT = 72;
  const PADDING = 80;
  const RADIUS = 220;

  return useMemo(() => {
    const n = entityTypes.length;
    const positions: Record<string, { x: number; y: number }> = {};
    if (n === 0) return { positions, width: 600, height: 400 };
    entityTypes.forEach((et, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      positions[et.id] = {
        x: PADDING + RADIUS + RADIUS * Math.cos(angle),
        y: PADDING + RADIUS + RADIUS * Math.sin(angle),
      };
    });
    const width = PADDING * 2 + RADIUS * 2;
    const height = PADDING * 2 + RADIUS * 2;
    return { positions, width, height, nodeWidth: NODE_WIDTH, nodeHeight: NODE_HEIGHT };
  }, [entityTypes]);
}

export default function DataModelPage() {
  const router = useRouter();
  const {
    entityTypes,
    entities,
    relationshipTypes,
    relationships,
    isLoading,
    createEntityType,
    updateEntityType,
    deleteEntityType,
    createEntity,
    updateEntity,
    deleteEntity,
    createRelationshipType,
    refetch,
  } = useOntology();

  const [activeTab, setActiveTab] = useState<'overview' | 'graph' | 'table'>('overview');
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [createEntityTypeOpen, setCreateEntityTypeOpen] = useState(false);
  const [createRelationshipOpen, setCreateRelationshipOpen] = useState(false);
  const [expandedTableRow, setExpandedTableRow] = useState<string | null>(null);
  const [uploadNames, setUploadNames] = useState<Record<string, string>>({});
  const [deleteTypeModalOpen, setDeleteTypeModalOpen] = useState(false);
  const [deleteTypeConfirmName, setDeleteTypeConfirmName] = useState('');
  const [expandedEntityId, setExpandedEntityId] = useState<string | null>(null);
  const [entityDeleteConfirmId, setEntityDeleteConfirmId] = useState<string | null>(null);
  const [propertyDeletedAt, setPropertyDeletedAt] = useState<{ index: number; property: EntityProperty } | null>(null);
  const propertyUndoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [savedIndicator, setSavedIndicator] = useState<'name' | 'description' | null>(null);
  const nameTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const descTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const newPropertyLabelRef = useRef<HTMLInputElement | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [localName, setLocalName] = useState('');
  const [localDescription, setLocalDescription] = useState('');
  const previousNameRef = useRef('');
  const previousDescRef = useRef('');

  const selectedType = selectedTypeId ? (entityTypes.find((et) => et.id === selectedTypeId) || null) : null;
  const entitiesForType = selectedType
    ? entities.filter((e) => e.entity_type_id === selectedType.id)
    : [];
  const { positions, width, height, nodeWidth, nodeHeight } = useGraphLayout(entityTypes);

  const relationshipCountByType = useMemo(() => {
    const map: Record<string, number> = {};
    entityTypes.forEach((et) => {
      map[et.id] = relationshipTypes.filter(
        (r) => r.from_type_id === et.id || r.to_type_id === et.id,
      ).length;
    });
    return map;
  }, [entityTypes, relationshipTypes]);

  useEffect(() => {
    if (!selectedType) return;
    setLocalName(selectedType.name);
    setLocalDescription(selectedType.description ?? '');
  }, [selectedType?.id, selectedType?.name, selectedType?.description]);

  const uploadIds = useMemo(
    () => Array.from(new Set(entities.map((e) => e.source_upload_id).filter(Boolean))) as string[],
    [entities],
  );
  useEffect(() => {
    if (uploadIds.length === 0) return;
    const supabase = createClient();
    supabase
      .from('uploads')
      .select('id, file_name')
      .in('id', uploadIds)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        (data ?? []).forEach((r: { id: string; file_name: string }) => {
          map[r.id] = r.file_name;
        });
        setUploadNames(map);
      });
  }, [uploadIds.join(',')]);

  const logAudit = useCallback(
    async (action: string, description: string, metadata?: Record<string, unknown>) => {
      try {
        await fetch('/api/audit/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, description, metadata }),
        });
      } catch {
        // non-blocking
      }
    },
    [],
  );

  const saveEntityTypeField = useCallback(
    async (
      field: 'name' | 'description' | 'icon' | 'color' | 'properties',
      value: string | EntityProperty[],
    ) => {
      if (!selectedType) return;
      const prev = field === 'name' ? selectedType.name : field === 'description' ? selectedType.description ?? '' : undefined;
      const payload =
        field === 'name'
          ? { name: value as string }
          : field === 'description'
            ? { description: (value as string) || null }
            : field === 'icon'
              ? { icon: value as string }
              : field === 'color'
                ? { color: value as string }
                : { properties: value as EntityProperty[] };
      const updated = await updateEntityType(selectedType.id, payload);
      if (!updated) {
        toast.error('Failed to save changes');
        if (field === 'name') setLocalName(prev as string);
        if (field === 'description') setLocalDescription(prev as string);
        return;
      }
      setSavedIndicator(field === 'name' ? 'name' : field === 'description' ? 'description' : null);
      if (field === 'name' || field === 'description') {
        setTimeout(() => setSavedIndicator(null), 1500);
      }
      if (field === 'name' || field === 'description' || field === 'properties') {
        void logAudit('ontology.entity_type_updated', `Updated entity type ${selectedType.name}`, {
          field,
          entity_type_id: selectedType.id,
        });
      }
    },
    [selectedType, updateEntityType, logAudit],
  );

  useEffect(() => {
    return () => {
      if (nameTimeoutRef.current) clearTimeout(nameTimeoutRef.current);
      if (descTimeoutRef.current) clearTimeout(descTimeoutRef.current);
      if (propertyUndoTimeoutRef.current) clearTimeout(propertyUndoTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!iconPickerOpen && !colorPickerOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      setIconPickerOpen(false);
      setColorPickerOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [iconPickerOpen, colorPickerOpen]);

  const relationshipsForEntity = useCallback(
    (entityId: string) => {
      const out: { relName: string; targetName: string }[] = [];
      relationships.forEach((r) => {
        const relType = relationshipTypes.find((rt) => rt.id === r.relationship_type_id);
        const fromEntity = entities.find((e) => e.id === r.from_entity_id);
        const toEntity = entities.find((e) => e.id === r.to_entity_id);
        if (r.from_entity_id === entityId && toEntity) {
          out.push({ relName: relType?.name ?? '', targetName: toEntity.name });
        } else if (r.to_entity_id === entityId && fromEntity) {
          out.push({ relName: relType?.name ?? '', targetName: fromEntity.name });
        }
      });
      return out;
    },
    [relationships, relationshipTypes, entities],
  );

  if (isLoading) {
    return (
      <div className="flex h-[70vh] items-center justify-center rounded-3xl border border-zinc-800 bg-zinc-950">
        <div className="text-sm text-slate-400">Loading data model…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tighter text-slate-100">
            Your Business
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            How Aether understands your operations.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCreateEntityTypeOpen(true)}
            className="inline-flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-zinc-600 hover:bg-zinc-900"
          >
            <Plus className="h-4 w-4" />
            Add Category
          </button>
          <button
            type="button"
            onClick={() => setCreateRelationshipOpen(true)}
            className="inline-flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-zinc-600 hover:bg-zinc-900"
          >
            <Link2 className="h-4 w-4" />
            Add Connection
          </button>
        </div>
      </div>

      {/* Tabs: Overview (default) | Map View | Table */}
      <div className="flex gap-1 rounded-2xl border border-zinc-800 bg-zinc-950 p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={cn(
            'rounded-xl px-4 py-2 text-sm font-medium transition',
            activeTab === 'overview'
              ? 'bg-zinc-800 text-slate-100'
              : 'text-slate-400 hover:text-slate-200',
          )}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('graph')}
          className={cn(
            'rounded-xl px-4 py-2 text-sm font-medium transition',
            activeTab === 'graph'
              ? 'bg-zinc-800 text-slate-100'
              : 'text-slate-400 hover:text-slate-200',
          )}
        >
          Map View
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('table')}
          className={cn(
            'rounded-xl px-4 py-2 text-sm font-medium transition',
            activeTab === 'table'
              ? 'bg-zinc-800 text-slate-100'
              : 'text-slate-400 hover:text-slate-200',
          )}
        >
          Table
        </button>
      </div>

      {entityTypes.length > 0 &&
        entities.some((e) => e.source_upload_id) && (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <Sparkles className="h-4 w-4 shrink-0 text-emerald-400" />
            <span className="text-xs text-emerald-400">
              Aether detected {entityTypes.length} categor{entityTypes.length === 1 ? 'y' : 'ies'} and{' '}
              {relationshipTypes.length} connection{relationshipTypes.length === 1 ? '' : 's'} from your data
            </span>
          </div>
        )}

      {activeTab === 'overview' && (
        <div className="space-y-8">
          {entityTypes.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-zinc-800 bg-zinc-950 px-10 py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 p-3">
                <Network className="h-12 w-12 text-emerald-400" />
              </div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-100">Aether will map your business automatically</h2>
              <p className="mt-2 max-w-sm text-sm text-slate-400">
                Once you connect a spreadsheet, we&apos;ll detect your team members, locations, products, and how they all relate. No setup needed.
              </p>
              <button
                type="button"
                onClick={() => router.push('/dashboard/data')}
                className="mt-6 rounded-2xl bg-emerald-500 px-6 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-600"
              >
                Connect Your Data
              </button>
              <button
                type="button"
                onClick={() => setCreateEntityTypeOpen(true)}
                className="mt-3 text-xs text-slate-400 hover:text-slate-200 underline"
              >
                Or create categories manually
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {entityTypes.map((et) => {
                  const IconComponent = ICON_MAP[et.icon?.toLowerCase()] ?? Circle;
                  const typeEntities = entities.filter((e) => e.entity_type_id === et.id);
                  const topThree = typeEntities
                    .map((e) => ({ entity: e, sorted: entityPropertiesSorted(e, et) }))
                    .sort((a, b) => {
                      const aVal = a.sorted[0]?.value;
                      const bVal = b.sorted[0]?.value;
                      const an = typeof aVal === 'number' ? aVal : Number(aVal);
                      const bn = typeof bVal === 'number' ? bVal : Number(bVal);
                      return (Number.isNaN(bn) ? 0 : bn) - (Number.isNaN(an) ? 0 : an);
                    })
                    .slice(0, 3);
                  return (
                    <div
                      key={et.id}
                      className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6"
                    >
                      <div className="flex items-center gap-2 mb-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl shrink-0" style={{ backgroundColor: `${et.color}1A` }}>
                          <IconComponent className="h-5 w-5" style={{ color: et.color }} />
                        </div>
                        <span className="text-lg font-semibold text-slate-100">{et.name}</span>
                        <span className="text-xs text-slate-400 ml-auto">{typeEntities.length} total</span>
                      </div>
                      <ul className="space-y-2">
                        {topThree.map(({ entity: e, sorted }) => (
                          <li key={e.id} className="text-sm">
                            <span className="font-medium text-slate-200">{e.name}</span>
                            {sorted[0] != null && (
                              <span className="text-slate-400 ml-1">— {formatPropertyValue(sorted[0].value, sorted[0].type)} {sorted[0].label.toLowerCase()}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        onClick={() => { setActiveTab('graph'); setSelectedTypeId(et.id); }}
                        className="mt-4 text-xs text-emerald-400 hover:text-emerald-300"
                      >
                        View all →
                      </button>
                    </div>
                  );
                })}
              </div>
              {relationshipTypes.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-slate-300 mb-3">How things connect</h3>
                  <ul className="space-y-2">
                    {relationshipTypes.slice(0, 8).map((rel) => {
                      const fromType = entityTypes.find((t) => t.id === rel.from_type_id);
                      const toType = entityTypes.find((t) => t.id === rel.to_type_id);
                      const fromEntities = entities.filter((e) => e.entity_type_id === rel.from_type_id);
                      const toEntities = entities.filter((e) => e.entity_type_id === rel.to_type_id);
                      const sampleFrom = fromEntities[0]?.name;
                      const sampleTo = toEntities.find((e) => e.id !== fromEntities[0]?.id)?.name ?? toEntities[0]?.name;
                      return (
                        <li key={rel.id} className="text-sm text-slate-400">
                          <span className="text-slate-200">{sampleFrom ?? fromType?.name}</span>
                          {' '}{rel.name}{' '}
                          <span className="text-slate-200">{sampleTo ?? toType?.name}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'graph' && (
        <div className="flex gap-0 overflow-hidden rounded-3xl border border-zinc-800 bg-[#0A0A0A] shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
          <div
            className="relative flex-1 overflow-auto"
            style={{
              backgroundImage: 'radial-gradient(circle, #1a1a2e 1px, transparent 1px)',
              backgroundSize: '24px 24px',
              minHeight: 560,
            }}
          >
            {entityTypes.length === 0 ? (
              <div className="flex h-[520px] flex-col items-center justify-center gap-4 px-8 text-center">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-8 max-w-md">
                  <p className="text-slate-200">
                    Aether will map your business automatically. Connect a spreadsheet to get started.
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push('/dashboard/data')}
                    className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-600"
                  >
                    Connect Your Data
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div
                  className="relative shrink-0"
                  style={{ width, height, minHeight: height }}
                >
                  <svg
                    className="absolute left-0 top-0 pointer-events-none"
                    width={width}
                    height={height}
                  >
                    {relationshipTypes.map((rel) => {
                      const fromPos = positions[rel.from_type_id];
                      const toPos = positions[rel.to_type_id];
                      if (!fromPos || !toPos) return null;
                      const x1 = fromPos.x;
                      const y1 = fromPos.y;
                      const x2 = toPos.x;
                      const y2 = toPos.y;
                      const midX = (x1 + x2) / 2;
                      const midY = (y1 + y2) / 2;
                      return (
                        <g key={rel.id}>
                          <line
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            stroke="#52525b"
                            strokeWidth={1}
                          />
                          <text
                            x={midX}
                            y={midY}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill="#94a3b8"
                            style={{ fontSize: 10, fontWeight: 500 }}
                          >
                            {rel.name}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                  <div className="absolute left-0 top-0" style={{ width, height }}>
                  {entityTypes.map((et) => {
                    const pos = positions[et.id];
                    if (!pos) return null;
                    const IconComponent = ICON_MAP[et.icon.toLowerCase()] ?? Circle;
                    const count = entities.filter((e) => e.entity_type_id === et.id).length;
                    const isSelected = selectedTypeId === et.id;
                    return (
                      <button
                        key={et.id}
                        type="button"
                        onClick={() => setSelectedTypeId(et.id)}
                        className="absolute rounded-2xl border bg-zinc-950/95 shadow-lg transition hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                        style={{
                          left: pos.x - (nodeWidth ?? 200) / 2,
                          top: pos.y - (nodeHeight ?? 72) / 2,
                          width: nodeWidth,
                          height: nodeHeight,
                          borderColor: isSelected ? '#10B981' : '#27272a',
                          backgroundColor: `${et.color}14`,
                          borderLeftWidth: '4px',
                          borderLeftColor: et.color,
                        }}
                      >
                        <div className="flex items-center gap-2 px-3 py-2">
                          <IconComponent className="h-5 w-5 shrink-0" style={{ color: et.color }} />
                          <span className="truncate text-sm font-medium text-slate-100">{et.name}</span>
                          <span className="ml-auto rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-slate-400">
                            {count}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                  </div>
                </div>
              </>
            )}
          </div>

          {selectedType && (
            <aside
              ref={panelRef}
              className="w-[380px] shrink-0 border-l border-zinc-800 bg-zinc-950/95 p-5 overflow-auto"
            >
              <EntityTypeDetailPanel
                selectedType={selectedType}
                entitiesForType={entitiesForType}
                relationshipsForEntity={relationshipsForEntity}
                uploadNames={uploadNames}
                updateEntityType={updateEntityType}
                deleteEntityType={deleteEntityType}
                updateEntity={updateEntity}
                deleteEntity={deleteEntity}
                logAudit={logAudit}
                onDeselect={() => setSelectedTypeId(null)}
                onDeleteTypeClick={() => {
                  setDeleteTypeConfirmName('');
                  setDeleteTypeModalOpen(true);
                }}
                iconPickerOpen={iconPickerOpen}
                setIconPickerOpen={setIconPickerOpen}
                colorPickerOpen={colorPickerOpen}
                setColorPickerOpen={setColorPickerOpen}
                localName={localName}
                setLocalName={setLocalName}
                localDescription={localDescription}
                setLocalDescription={setLocalDescription}
                editingName={editingName}
                setEditingName={setEditingName}
                editingDescription={editingDescription}
                setEditingDescription={setEditingDescription}
                savedIndicator={savedIndicator}
                saveEntityTypeField={saveEntityTypeField}
                nameTimeoutRef={nameTimeoutRef}
                descTimeoutRef={descTimeoutRef}
                nameInputRef={nameInputRef}
                descTextareaRef={descTextareaRef}
                previousNameRef={previousNameRef}
                previousDescRef={previousDescRef}
                propertyDeletedAt={propertyDeletedAt}
                setPropertyDeletedAt={setPropertyDeletedAt}
                propertyUndoTimeoutRef={propertyUndoTimeoutRef}
                expandedEntityId={expandedEntityId}
                setExpandedEntityId={setExpandedEntityId}
                entityDeleteConfirmId={entityDeleteConfirmId}
                setEntityDeleteConfirmId={setEntityDeleteConfirmId}
                newPropertyLabelRef={newPropertyLabelRef}
              />
            </aside>
          )}
        </div>
      )}

      {activeTab === 'table' && (
        <div className="rounded-3xl border border-zinc-800 bg-zinc-950 shadow-[0_0_0_1px_rgba(24,24,27,0.9)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/50">
                  <th className="w-8 px-4 py-3" />
                  <th className="px-4 py-3 font-medium text-slate-400">Name</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Description</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Count</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Fields</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Connections</th>
                </tr>
              </thead>
              <tbody>
                {entityTypes.map((et) => {
                  const entityCount = entities.filter((e) => e.entity_type_id === et.id).length;
                  const relCount = relationshipCountByType[et.id] ?? 0;
                  const isExpanded = expandedTableRow === et.id;
                  return (
                    <React.Fragment key={et.id}>
                      <tr
                        className="border-b border-zinc-800/80 hover:bg-zinc-900/50 cursor-pointer"
                        onClick={() => setExpandedTableRow(isExpanded ? null : et.id)}
                      >
                        <td className="px-4 py-3">
                          {entityCount > 0 ? (
                            isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-slate-500" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-slate-500" />
                            )
                          ) : null}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-100">{et.name}</td>
                        <td className="max-w-[200px] truncate px-4 py-3 text-slate-400">
                          {et.description ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-300">{entityCount}</td>
                        <td className="px-4 py-3 text-slate-300">{et.properties.length}</td>
                        <td className="px-4 py-3 text-slate-300">{relCount}</td>
                      </tr>
                      {isExpanded && entityCount > 0 && (
                        <tr className="bg-zinc-900/30">
                          <td colSpan={6} className="px-4 py-3">
                            <ul className="space-y-1 pl-6">
                              {entities
                                .filter((e) => e.entity_type_id === et.id)
                                .map((e) => (
                                  <li key={e.id} className="text-xs text-slate-400">
                                    {entityInlineSummary(e, et)}
                                  </li>
                                ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {entityTypes.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-500">
              No categories yet. Create one to get started.
            </div>
          )}
        </div>
      )}

      {/* Create Entity Type Modal */}
      {createEntityTypeOpen && (
        <CreateEntityTypeModal
          onClose={() => setCreateEntityTypeOpen(false)}
          onCreate={async (input) => {
            const slug = slugFromLabel(input.name);
            const created = await createEntityType({
              name: input.name,
              slug,
              description: input.description || null,
              icon: input.icon ?? 'circle',
              color: input.color ?? '#10B981',
              properties: input.properties ?? [],
            });
            if (created) setCreateEntityTypeOpen(false);
          }}
        />
      )}

      {/* Create Relationship Modal */}
      {createRelationshipOpen && (
        <CreateRelationshipModal
          entityTypes={entityTypes}
          onClose={() => setCreateRelationshipOpen(false)}
          onCreate={async (input) => {
            const created = await createRelationshipType({
              name: input.name,
              from_type_id: input.from_type_id,
              to_type_id: input.to_type_id,
              description: input.description || null,
            });
            if (created) setCreateRelationshipOpen(false);
          }}
        />
      )}

      {/* Delete Entity Type Modal */}
      {deleteTypeModalOpen && selectedType && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setDeleteTypeModalOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10">
                <Trash2 className="h-6 w-6 text-rose-400" />
              </div>
              <h2 className="text-lg font-semibold text-slate-100">Delete {selectedType.name}?</h2>
              <p className="mt-2 text-sm text-slate-400">
                This will permanently remove {entitiesForType.length} entit{entitiesForType.length === 1 ? 'y' : 'ies'} and
                all their relationships.
              </p>
              <label className="mt-4 w-full text-left text-xs text-slate-500">
                Type <span className="font-mono text-slate-400">{selectedType.name}</span> to confirm
              </label>
              <input
                type="text"
                value={deleteTypeConfirmName}
                onChange={(e) => setDeleteTypeConfirmName(e.target.value)}
                placeholder={selectedType.name}
                className="mt-1.5 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-zinc-600 focus:outline-none"
              />
              <div className="mt-6 flex w-full gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTypeModalOpen(false)}
                  className="rounded-2xl border border-zinc-700 px-5 py-2.5 text-sm text-slate-300 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleteTypeConfirmName.trim() !== selectedType.name}
                  onClick={async () => {
                    if (deleteTypeConfirmName.trim() !== selectedType.name) return;
                    const ok = await deleteEntityType(selectedType.id);
                    if (ok) {
                      setDeleteTypeModalOpen(false);
                      setSelectedTypeId(null);
                      toast.success('Entity type deleted');
                      void logAudit('ontology.entity_type_deleted', `Deleted entity type: ${selectedType.name}`, {
                        entity_type_id: selectedType.id,
                      });
                    } else {
                      toast.error('Failed to delete entity type');
                    }
                  }}
                  className="rounded-2xl bg-rose-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-rose-600 disabled:pointer-events-none disabled:opacity-50"
                >
                  Permanently delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ----- Entity Type Detail Panel (editable)
const DEBOUNCE_MS = 800;

interface EntityTypeDetailPanelProps {
  selectedType: EntityType;
  entitiesForType: Entity[];
  relationshipsForEntity: (entityId: string) => { relName: string; targetName: string }[];
  uploadNames: Record<string, string>;
  updateEntityType: (id: string, input: Partial<{ name: string; description: string | null; icon: string; color: string; properties: EntityProperty[] }>) => Promise<EntityType | null>;
  deleteEntityType: (id: string) => Promise<boolean>;
  updateEntity: (id: string, input: Partial<{ name: string; properties: Record<string, unknown> }>) => Promise<Entity | null>;
  deleteEntity: (id: string) => Promise<boolean>;
  logAudit: (action: string, description: string, metadata?: Record<string, unknown>) => Promise<void>;
  onDeselect: () => void;
  onDeleteTypeClick: () => void;
  iconPickerOpen: boolean;
  setIconPickerOpen: (v: boolean) => void;
  colorPickerOpen: boolean;
  setColorPickerOpen: (v: boolean) => void;
  localName: string;
  setLocalName: (v: string) => void;
  localDescription: string;
  setLocalDescription: (v: string) => void;
  editingName: boolean;
  setEditingName: (v: boolean) => void;
  editingDescription: boolean;
  setEditingDescription: (v: boolean) => void;
  savedIndicator: 'name' | 'description' | null;
  saveEntityTypeField: (field: 'name' | 'description' | 'icon' | 'color' | 'properties', value: string | EntityProperty[]) => Promise<void>;
  nameTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  descTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  nameInputRef: React.RefObject<HTMLInputElement | null>;
  descTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  previousNameRef: React.MutableRefObject<string>;
  previousDescRef: React.MutableRefObject<string>;
  propertyDeletedAt: { index: number; property: EntityProperty } | null;
  setPropertyDeletedAt: (v: { index: number; property: EntityProperty } | null) => void;
  propertyUndoTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  expandedEntityId: string | null;
  setExpandedEntityId: (v: string | null) => void;
  entityDeleteConfirmId: string | null;
  setEntityDeleteConfirmId: (v: string | null) => void;
  newPropertyLabelRef: React.RefObject<HTMLInputElement | null>;
}

function EntityTypeDetailPanel(props: EntityTypeDetailPanelProps) {
  const {
    selectedType,
    entitiesForType,
    relationshipsForEntity,
    uploadNames,
    updateEntityType,
    deleteEntity,
    logAudit,
    onDeleteTypeClick,
    iconPickerOpen,
    setIconPickerOpen,
    colorPickerOpen,
    setColorPickerOpen,
    localName,
    setLocalName,
    localDescription,
    setLocalDescription,
    editingName,
    setEditingName,
    editingDescription,
    setEditingDescription,
    savedIndicator,
    saveEntityTypeField,
    nameTimeoutRef,
    descTimeoutRef,
    nameInputRef,
    descTextareaRef,
    previousNameRef,
    previousDescRef,
    propertyDeletedAt,
    setPropertyDeletedAt,
    propertyUndoTimeoutRef,
    expandedEntityId,
    setExpandedEntityId,
    entityDeleteConfirmId,
    setEntityDeleteConfirmId,
    newPropertyLabelRef,
  } = props;

  const [localProperties, setLocalProperties] = useState<EntityProperty[]>(selectedType.properties);
  useEffect(() => {
    setLocalProperties(selectedType.properties);
  }, [selectedType.id, selectedType.properties]);

  const handleNameBlur = () => {
    if (nameTimeoutRef.current) {
      clearTimeout(nameTimeoutRef.current);
      nameTimeoutRef.current = null;
    }
    const value = nameInputRef.current?.value ?? localName;
    if (value.trim() && value !== selectedType.name) {
      previousNameRef.current = selectedType.name;
      void saveEntityTypeField('name', value.trim());
    }
    setEditingName(false);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setLocalName(v);
    if (nameTimeoutRef.current) clearTimeout(nameTimeoutRef.current);
    nameTimeoutRef.current = setTimeout(() => {
      nameTimeoutRef.current = null;
      if (v.trim() && v !== selectedType.name) {
        previousNameRef.current = selectedType.name;
        void saveEntityTypeField('name', v.trim());
      }
    }, DEBOUNCE_MS);
  };

  const handleDescBlur = () => {
    if (descTimeoutRef.current) {
      clearTimeout(descTimeoutRef.current);
      descTimeoutRef.current = null;
    }
    const value = descTextareaRef.current?.value ?? localDescription;
    if (value !== (selectedType.description ?? '')) {
      previousDescRef.current = selectedType.description ?? '';
      void saveEntityTypeField('description', value.trim() || '');
    }
    setEditingDescription(false);
  };

  const handleDescChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setLocalDescription(v);
    if (descTimeoutRef.current) clearTimeout(descTimeoutRef.current);
    descTimeoutRef.current = setTimeout(() => {
      descTimeoutRef.current = null;
      if (v !== (selectedType.description ?? '')) {
        previousDescRef.current = selectedType.description ?? '';
        void saveEntityTypeField('description', v.trim() || '');
      }
    }, DEBOUNCE_MS);
  };

  const addProperty = () => {
    const label = '';
    const key = slugFromLabel(label || `property_${localProperties.length + 1}`);
    const next = [...localProperties, { key, label, type: 'text' as PropertyType, visible: true }];
    setLocalProperties(next);
    void saveEntityTypeField('properties', next);
    requestAnimationFrame(() => newPropertyLabelRef.current?.focus());
  };

  const updateProperty = (index: number, updates: Partial<EntityProperty>) => {
    const next = localProperties.map((p, i) => (i === index ? { ...p, ...updates, ...(updates.label !== undefined ? { key: slugFromLabel(updates.label || p.label) } : {}) } : p));
    setLocalProperties(next);
    void saveEntityTypeField('properties', next);
  };

  const removeProperty = (index: number) => {
    const property = localProperties[index];
    setPropertyDeletedAt({ index, property });
    const next = localProperties.filter((_, i) => i !== index);
    setLocalProperties(next);
    void saveEntityTypeField('properties', next);
    if (propertyUndoTimeoutRef.current) clearTimeout(propertyUndoTimeoutRef.current);
    propertyUndoTimeoutRef.current = setTimeout(() => {
      setPropertyDeletedAt(null);
      propertyUndoTimeoutRef.current = null;
    }, 4000);
  };

  const undoPropertyDelete = () => {
    if (propertyUndoTimeoutRef.current) {
      clearTimeout(propertyUndoTimeoutRef.current);
      propertyUndoTimeoutRef.current = null;
    }
    if (!propertyDeletedAt) return;
    const next = [...localProperties];
    next.splice(propertyDeletedAt.index, 0, propertyDeletedAt.property);
    setLocalProperties(next);
    void saveEntityTypeField('properties', next);
    setPropertyDeletedAt(null);
  };

  const confirmDeleteEntity = async (entityId: string) => {
    const ok = await deleteEntity(entityId);
    if (ok) {
      setEntityDeleteConfirmId(null);
      setExpandedEntityId(null);
      toast.success('Entity removed');
      void logAudit('ontology.entity_deleted', 'Deleted entity', { entity_id: entityId });
    } else {
      toast.error('Failed to remove entity');
    }
  };

  const visibleProperties = localProperties.filter((p) => p.visible !== false);
  const IconComponent = ICON_MAP[selectedType.icon?.toLowerCase()] ?? Circle;

  return (
    <div className="space-y-4">
      {/* Header: icon, name, description, color, delete */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => { setIconPickerOpen(!iconPickerOpen); setColorPickerOpen(false); }}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-transparent hover:border-zinc-600 transition-colors"
              style={{ backgroundColor: `${selectedType.color}20` }}
            >
              <IconComponent className="h-5 w-5" style={{ color: selectedType.color }} />
            </button>
            {iconPickerOpen && (
              <div className="absolute left-0 top-full mt-1 z-10 rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl p-3 w-[220px]">
                <div className="grid grid-cols-5 gap-1">
                  {ICON_PICKER_OPTIONS.map((opt) => {
                    const Ic = ICON_MAP[opt.key] ?? Circle;
                    const isSelected = selectedType.icon?.toLowerCase() === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => {
                          void saveEntityTypeField('icon', opt.key);
                          setIconPickerOpen(false);
                        }}
                        className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-xl border transition',
                          isSelected ? 'border-emerald-500 bg-emerald-500/10' : 'border-transparent hover:bg-zinc-800',
                        )}
                      >
                        <Ic className="h-4 w-4" style={{ color: isSelected ? '#10B981' : undefined }} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  ref={nameInputRef}
                  type="text"
                  value={localName}
                  onChange={handleNameChange}
                  onBlur={handleNameBlur}
                  onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), handleNameBlur())}
                  className="flex-1 rounded border border-transparent bg-transparent px-0 py-0.5 text-lg font-semibold text-slate-100 focus:border-emerald-500/50 focus:outline-none focus:ring-0"
                  autoFocus
                />
                {savedIndicator === 'name' && (
                  <span className="inline-flex text-emerald-400 animate-fade-in-out">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingName(true)}
                  className="text-left text-lg font-semibold text-slate-100 hover:bg-zinc-800/50 rounded px-1 -mx-1"
                >
                  {localName || selectedType.name}
                </button>
                {savedIndicator === 'name' && (
                  <span className="inline-flex text-emerald-400 animate-fade-in-out">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>
            )}
            {editingDescription ? (
              <textarea
                ref={descTextareaRef}
                value={localDescription}
                onChange={handleDescChange}
                onBlur={handleDescBlur}
                rows={Math.min(3, Math.max(1, localDescription.split('\n').length))}
                className="mt-0.5 w-full resize-none rounded border border-transparent bg-transparent px-0 py-0.5 text-xs text-slate-400 focus:border-emerald-500/50 focus:outline-none placeholder:text-slate-500"
                placeholder="Add description..."
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingDescription(true)}
                className={cn(
                  'mt-0.5 block w-full text-left text-xs rounded px-1 -mx-1',
                  localDescription ? 'text-slate-400' : 'text-slate-500 italic',
                )}
              >
                {localDescription || 'Add description...'}
              </button>
            )}
            {savedIndicator === 'description' && (
              <span className="text-[10px] text-emerald-400/70 animate-fade-in-out">Saved</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <div className="relative">
            <button
              type="button"
              onClick={() => { setColorPickerOpen(!colorPickerOpen); setIconPickerOpen(false); }}
              className="h-7 w-7 rounded-full border-2 border-zinc-700 hover:border-zinc-500 transition"
              style={{ backgroundColor: selectedType.color }}
              title="Color"
            />
            {colorPickerOpen && (
              <div className="absolute right-0 top-full mt-1 z-10 rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl p-3 flex flex-wrap gap-2">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => {
                      void saveEntityTypeField('color', c.value);
                      setColorPickerOpen(false);
                    }}
                    className={cn(
                      'h-7 w-7 rounded-full transition',
                      selectedType.color === c.value ? 'ring-2 ring-white' : '',
                    )}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onDeleteTypeClick}
            className="rounded p-1.5 text-slate-500 hover:text-rose-400 transition"
            aria-label="Delete entity type"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Properties */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-medium uppercase tracking-wider text-slate-500">Properties</h4>
          <button
            type="button"
            onClick={addProperty}
            className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
          >
            + Add
          </button>
        </div>
        <ul className="space-y-1.5">
          {localProperties.map((p, index) => {
            if (propertyDeletedAt?.index === index) return null;
            const visible = p.visible !== false;
            return (
              <li
                key={p.key}
                className={cn(
                  'flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 text-xs transition',
                  !visible && 'opacity-50',
                )}
              >
                <input
                  type="text"
                  value={p.label}
                  onChange={(e) => {
                    const next = localProperties.map((pp, i) => (i === index ? { ...pp, label: e.target.value } : pp));
                    setLocalProperties(next);
                  }}
                  onBlur={() => {
                    const next = localProperties.map((pp, i) => (i === index ? { ...pp, key: slugFromLabel(pp.label || 'field') } : pp));
                    setLocalProperties(next);
                    void saveEntityTypeField('properties', next);
                  }}
                  placeholder="Property name"
                  className="flex-1 min-w-0 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-slate-200 text-xs focus:border-emerald-500/50 focus:outline-none"
                />
                <select
                  value={p.type}
                  onChange={(e) => updateProperty(index, { type: e.target.value as PropertyType })}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-slate-200 focus:outline-none"
                >
                  {PROPERTY_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => updateProperty(index, { visible: !visible })}
                  className="rounded p-1 text-slate-500 hover:text-slate-300"
                  title={visible ? 'Hide from AI and cards' : 'Show'}
                >
                  {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => removeProperty(index)}
                  className="rounded p-1 text-slate-500 hover:text-rose-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
          {propertyDeletedAt !== null && (
            <li className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/30 px-3 py-2 text-xs">
              <span className="text-slate-500">Property deleted</span>
              <button type="button" onClick={undoPropertyDelete} className="text-emerald-400 hover:text-emerald-300">
                Undo
              </button>
            </li>
          )}
        </ul>
      </div>

      {/* Entities */}
      <div>
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          Entities ({entitiesForType.length})
        </h4>
        <ul
          className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1"
          style={{
            maskImage: entitiesForType.length > 8 ? 'linear-gradient(to bottom, black 0%, black 85%, transparent 100%)' : undefined,
          }}
        >
          {entitiesForType.map((e) => {
            const topProps = entityPropertiesSorted(e, selectedType).slice(0, 3);
            const expanded = expandedEntityId === e.id;
            const rels = relationshipsForEntity(e.id);
            const isDeleteConfirm = entityDeleteConfirmId === e.id;
            return (
              <li key={e.id} className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedEntityId(expanded ? null : e.id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                >
                  <span className="text-sm font-medium text-slate-200 flex-1 truncate">{e.name}</span>
                  {topProps.length > 0 && (
                    <span className="text-xs text-slate-400 truncate max-w-[140px]">
                      {topProps.map((p) => `${p.label}: ${formatPropertyValue(p.value, p.type)}`).join(' · ')}
                    </span>
                  )}
                  {expanded ? <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />}
                </button>
                <div
                  className="overflow-hidden transition-all duration-200 ease-out"
                  style={{ maxHeight: expanded ? 400 : 0 }}
                >
                  <div className="border-t border-zinc-800 px-3 py-2.5 space-y-2 text-xs">
                    {entityPropertiesSorted(e, selectedType).map((p) => (
                      <div key={p.key} className="flex justify-between gap-2">
                        <span className="text-slate-500">{p.label}</span>
                        <span className="text-slate-200 tabular-nums">{formatPropertyValue(p.value, p.type)}</span>
                      </div>
                    ))}
                    {rels.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {rels.map((r, i) => (
                          <span key={i} className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-slate-300">
                            {r.relName} → {r.targetName}
                          </span>
                        ))}
                      </div>
                    )}
                    {e.source_upload_id && uploadNames[e.source_upload_id] && (
                      <p className="text-slate-500 pt-0.5">Detected from {uploadNames[e.source_upload_id]}</p>
                    )}
                    {!isDeleteConfirm ? (
                      <button
                        type="button"
                        onClick={(ev) => { ev.stopPropagation(); setEntityDeleteConfirmId(e.id); }}
                        className="text-xs text-rose-400/60 hover:text-rose-400"
                      >
                        Remove entity
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">
                        Are you sure?{' '}
                        <button type="button" onClick={() => confirmDeleteEntity(e.id)} className="text-rose-400 mr-1">Yes</button>
                        <button type="button" onClick={() => setEntityDeleteConfirmId(null)}>No</button>
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ----- Create Entity Type Modal
interface CreateEntityTypeModalProps {
  onClose: () => void;
  onCreate: (input: {
    name: string;
    description: string;
    icon: string;
    color: string;
    properties: EntityProperty[];
  }) => Promise<void>;
}

function CreateEntityTypeModal({ onClose, onCreate }: CreateEntityTypeModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('circle');
  const [color, setColor] = useState('#10B981');
  const [properties, setProperties] = useState<EntityProperty[]>([]);
  const [saving, setSaving] = useState(false);

  const addProperty = () => {
    const label = `Property ${properties.length + 1}`;
    const key = slugFromLabel(label);
    setProperties([...properties, { key, label, type: 'text' }]);
  };

  const updateProperty = (index: number, updates: Partial<EntityProperty>) => {
    const next = [...properties];
    const p = { ...next[index], ...updates };
    if (updates.label !== undefined) p.key = slugFromLabel(p.label);
    next[index] = p;
    setProperties(next);
  };

  const removeProperty = (index: number) => {
    setProperties(properties.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim() || '',
        icon,
        color,
        properties,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-lg rounded-3xl border border-zinc-800 bg-zinc-950 shadow-xl">
        <div className="border-b border-zinc-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-100">Create Entity Type</h2>
          <p className="mt-1 text-xs text-slate-400">Define a new type in your data model.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Instructor, Location"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium text-slate-400">Icon</label>
            <div className="grid grid-cols-5 gap-2">
              {ICON_PICKER_OPTIONS.map((opt) => {
                const IconC = ICON_MAP[opt.key] ?? Circle;
                const isSelected = icon === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setIcon(opt.key)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-xl border py-2 text-[10px] transition',
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                        : 'border-zinc-800 bg-zinc-900/80 text-slate-400 hover:border-zinc-600 hover:text-slate-200',
                    )}
                  >
                    <IconC className="h-5 w-5" />
                    {opt.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium text-slate-400">Color</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={cn(
                    'h-8 w-8 rounded-full border-2 transition',
                    color === c.value ? 'border-slate-200 scale-110' : 'border-zinc-700 hover:scale-105',
                  )}
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-slate-400">Properties</label>
              <button
                type="button"
                onClick={addProperty}
                className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
              >
                + Add property
              </button>
            </div>
            <div className="space-y-2">
              {properties.map((p, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 p-2"
                >
                  <input
                    type="text"
                    value={p.label}
                    onChange={(e) => updateProperty(i, { label: e.target.value })}
                    placeholder="Label"
                    className="w-28 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-slate-100"
                  />
                  <select
                    value={p.type}
                    onChange={(e) => updateProperty(i, { type: e.target.value as PropertyType })}
                    className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-slate-100"
                  >
                    {PROPERTY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeProperty(i)}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-zinc-700 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-600 disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ----- Create Relationship Modal
interface CreateRelationshipModalProps {
  entityTypes: EntityType[];
  onClose: () => void;
  onCreate: (input: {
    from_type_id: string;
    name: string;
    to_type_id: string;
    description: string;
  }) => Promise<void>;
}

function CreateRelationshipModal({
  entityTypes,
  onClose,
  onCreate,
}: CreateRelationshipModalProps) {
  const [fromTypeId, setFromTypeId] = useState('');
  const [name, setName] = useState('');
  const [toTypeId, setToTypeId] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromTypeId || !toTypeId || !name.trim()) return;
    setSaving(true);
    try {
      await onCreate({
        from_type_id: fromTypeId,
        name: name.trim(),
        to_type_id: toTypeId,
        description: description.trim(),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 shadow-xl">
        <div className="border-b border-zinc-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-100">Create Relationship</h2>
          <p className="mt-1 text-xs text-slate-400">Connect two categories.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              From category
            </label>
            <select
              value={fromTypeId}
              onChange={(e) => setFromTypeId(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-slate-100 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              required
            >
              <option value="">Select type</option>
              {entityTypes.map((et) => (
                <option key={et.id} value={et.id}>
                  {et.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Relationship name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. teaches, works at"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              To category
            </label>
            <select
              value={toTypeId}
              onChange={(e) => setToTypeId(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-slate-100 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              required
            >
              <option value="">Select type</option>
              {entityTypes.map((et) => (
                <option key={et.id} value={et.id}>
                  {et.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !fromTypeId || !toTypeId || !name.trim()}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-600 disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
