'use client';

import React, { useMemo, useState } from 'react';
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
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { useOntology } from '@/hooks/use-ontology';
import type { Entity, EntityProperty, EntityType, PropertyType, RelationshipType } from '@/types/domain';
import { cn } from '@/lib/utils';

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
  const {
    entityTypes,
    entities,
    relationshipTypes,
    isLoading,
    createEntityType,
    updateEntityType,
    deleteEntityType,
    createRelationshipType,
  } = useOntology();

  const [activeTab, setActiveTab] = useState<'graph' | 'table'>('graph');
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [createEntityTypeOpen, setCreateEntityTypeOpen] = useState(false);
  const [createRelationshipOpen, setCreateRelationshipOpen] = useState(false);
  const [expandedTableRow, setExpandedTableRow] = useState<string | null>(null);

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
            Data Model
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Your operational ontology — entity types and how they connect.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCreateEntityTypeOpen(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-emerald-600 active:scale-[0.985]"
          >
            <Plus className="h-4 w-4" />
            Create Entity Type
          </button>
          <button
            type="button"
            onClick={() => setCreateRelationshipOpen(true)}
            className="inline-flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-zinc-600 hover:bg-zinc-900"
          >
            <Link2 className="h-4 w-4" />
            Create Relationship
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl border border-zinc-800 bg-zinc-950 p-1 w-fit">
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
          Graph View
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
          Table View
        </button>
      </div>

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
                    Define your operational model. Start by creating your first entity type — like
                    Instructor, Location, or Product.
                  </p>
                  <button
                    type="button"
                    onClick={() => setCreateEntityTypeOpen(true)}
                    className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-600"
                  >
                    <Plus className="h-4 w-4" />
                    Create Entity Type
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
                          left: pos.x - nodeWidth / 2,
                          top: pos.y - nodeHeight / 2,
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
            <aside className="w-[340px] shrink-0 border-l border-zinc-800 bg-zinc-950/95 p-5 overflow-auto">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const IconComponent = ICON_MAP[selectedType.icon.toLowerCase()] ?? Circle;
                      return (
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-xl"
                          style={{ backgroundColor: `${selectedType.color}20` }}
                        >
                          <IconComponent className="h-5 w-5" style={{ color: selectedType.color }} />
                        </div>
                      );
                    })()}
                    <div>
                      <h3 className="font-semibold text-slate-100">{selectedType.name}</h3>
                      {selectedType.description && (
                        <p className="text-xs text-slate-400">{selectedType.description}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                    Properties
                  </h4>
                  <ul className="space-y-1.5">
                    {selectedType.properties.length === 0 ? (
                      <li className="text-xs text-slate-500">No properties</li>
                    ) : (
                      selectedType.properties.map((p) => (
                        <li
                          key={p.key}
                          className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs"
                        >
                          <span className="text-slate-200">{p.label}</span>
                          <span className="text-slate-500">{p.type}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>

                <div>
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                    Entities ({entitiesForType.length})
                  </h4>
                  <ul className="max-h-48 space-y-1 overflow-auto">
                    {entitiesForType.length === 0 ? (
                      <li className="text-xs text-slate-500">No entities yet</li>
                    ) : (
                      entitiesForType.slice(0, 20).map((e) => (
                        <li
                          key={e.id}
                          className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs"
                        >
                          <span className="font-medium text-slate-200">{e.name}</span>
                          {Object.keys(e.properties).length > 0 && (
                            <span className="ml-2 text-slate-500">
                              {JSON.stringify(e.properties).slice(0, 40)}…
                            </span>
                          )}
                        </li>
                      ))
                    )}
                    {entitiesForType.length > 20 && (
                      <li className="text-xs text-slate-500">+{entitiesForType.length - 20} more</li>
                    )}
                  </ul>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-zinc-700"
                    onClick={() => {
                      // Edit: could open modal with selectedType
                    }}
                  >
                    <Pencil className="mr-1.5 inline h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/20"
                    onClick={async () => {
                      if (confirm('Delete this entity type? This cannot be undone.')) {
                        await deleteEntityType(selectedType.id);
                        setSelectedTypeId(null);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
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
                  <th className="px-4 py-3 font-medium text-slate-400">Entities</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Properties</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Relationships</th>
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
                                    {e.name}
                                    {Object.keys(e.properties).length > 0 &&
                                      ` — ${JSON.stringify(e.properties)}`}
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
              No entity types. Create one to get started.
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
          <p className="mt-1 text-xs text-slate-400">Connect two entity types.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              From entity type
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
              To entity type
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
