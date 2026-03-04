'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
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
import type {
  Entity,
  EntityProperty,
  EntityRelationship,
  EntityType,
  PropertyType,
  RelationshipType,
} from '@/types/domain';
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/use-user';
import { EntityDetailPanel } from '@/components/data/entity-detail-panel';

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

// ── Graph Console Theme Tokens ──────────────────────────────────────
const GRAPH = {
  bg: '#090909',
  gridDot: '#1a1a1a',
  gridSize: 20,
  edgeDefault: '#2a2a2e',
  edgeActive: '#3f3f46',
  edgeLabel: '#71717a',
  edgeLabelBg: '#0f0f11',
  nodeBg: '#0f0f11',
  nodeBorder: '#1f1f23',
  nodeSelectedBorder: 'rgba(16,185,129,0.4)',
  nodeTextPrimary: '#e4e4e7',
  nodeTextSecondary: '#71717a',
  nodeTextMetric: '#a1a1aa',
  // Desaturate entity colors: full for icon, muted for accents
  accentOpacity: 0.45,
  bgTintOpacity: 0.08,
} as const;

// ── Node size tiers based on entity count ───────────────────────────
interface NodeSize { w: number; h: number; tier: 'lg' | 'md' | 'sm' }

function getNodeSize(count: number, maxCount: number): NodeSize {
  if (maxCount === 0) return { w: 200, h: 90, tier: 'md' };
  const ratio = count / maxCount;
  if (ratio >= 0.5) return { w: 240, h: 110, tier: 'lg' };
  if (ratio >= 0.2) return { w: 200, h: 90, tier: 'md' };
  return { w: 170, h: 74, tier: 'sm' };
}

// ── Aggregate micro-metrics for an entity type ──────────────────────
interface MicroMetrics {
  items: { label: string; value: string }[];
}

function computeMicroMetrics(
  entityType: EntityType,
  typeEntities: Entity[],
): MicroMetrics {
  if (typeEntities.length === 0) return { items: [] };

  const numericProps = entityType.properties.filter(
    (p) => p.type === 'currency' || p.type === 'number' || p.type === 'percentage',
  );

  const items: { label: string; value: string; raw: number }[] = [];
  for (const prop of numericProps) {
    const values = typeEntities
      .map((e) => {
        const v = (e.properties as Record<string, unknown>)?.[prop.key];
        return typeof v === 'number' ? v : Number(v);
      })
      .filter((v) => !Number.isNaN(v));

    if (values.length === 0) continue;

    if (prop.type === 'percentage') {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      items.push({ label: prop.label, value: `${avg.toFixed(0)}%`, raw: avg });
    } else if (prop.type === 'currency') {
      const total = values.reduce((a, b) => a + b, 0);
      const formatted = total >= 1000
        ? `$${(total / 1000).toFixed(0)}k`
        : `$${total.toFixed(0)}`;
      items.push({ label: prop.label, value: formatted, raw: total });
    } else {
      const total = values.reduce((a, b) => a + b, 0);
      const formatted = total >= 1000
        ? `${(total / 1000).toFixed(1)}k`
        : `${total.toFixed(0)}`;
      items.push({ label: prop.label, value: formatted, raw: total });
    }
  }

  // Sort by absolute raw value descending, take top 2
  items.sort((a, b) => Math.abs(b.raw) - Math.abs(a.raw));
  return { items: items.slice(0, 2).map(({ label, value }) => ({ label, value })) };
}

// ── Graph layout: hierarchical circular positions ───────────────────
function useGraphLayout(
  entityTypes: EntityType[],
  entities: Entity[],
  relationshipCountByType: Record<string, number>,
) {
  const PADDING = 100;
  const BASE_RADIUS = 260;

  return useMemo(() => {
    const n = entityTypes.length;
    const positions: Record<string, { x: number; y: number }> = {};
    const nodeSizes: Record<string, NodeSize> = {};

    if (n === 0) return { positions, nodeSizes, width: 600, height: 400 };

    // Compute entity counts per type + max
    const counts: Record<string, number> = {};
    let maxCount = 0;
    for (const et of entityTypes) {
      const c = entities.filter((e) => e.entity_type_id === et.id).length;
      counts[et.id] = c;
      if (c > maxCount) maxCount = c;
    }

    // Compute sizes
    for (const et of entityTypes) {
      nodeSizes[et.id] = getNodeSize(counts[et.id], maxCount);
    }

    // Place in circle, but pull more-connected nodes inward
    const maxRels = Math.max(1, ...Object.values(relationshipCountByType));
    entityTypes.forEach((et, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      const relCount = relationshipCountByType[et.id] ?? 0;
      // More connections → closer to center (up to 30% inward)
      const pullFactor = 1 - (relCount / maxRels) * 0.3;
      const r = BASE_RADIUS * pullFactor;
      positions[et.id] = {
        x: PADDING + BASE_RADIUS + r * Math.cos(angle),
        y: PADDING + BASE_RADIUS + r * Math.sin(angle),
      };
    });

    const width = PADDING * 2 + BASE_RADIUS * 2;
    const height = PADDING * 2 + BASE_RADIUS * 2;
    return { positions, nodeSizes, width, height };
  }, [entityTypes, entities, relationshipCountByType]);
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
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  // ── Graph interaction state ─────────────────────────────────────────
  const { org } = useUser();
  const graphContainerRef = useRef<HTMLDivElement | null>(null);

  // Pan + Zoom
  const [graphScale, setGraphScale] = useState(1);
  const [graphTranslate, setGraphTranslate] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  // Drag
  const [dragPositions, setDragPositions] = useState<Record<string, { x: number; y: number }>>({});
  const isDragging = useRef<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const dragMoved = useRef(false);

  // Undo stack for drag positions
  const undoStack = useRef<Array<Record<string, { x: number; y: number }>>>([]);

  // Load persisted positions
  useEffect(() => {
    if (!org) return;
    try {
      const stored = localStorage.getItem(`aether_graph_positions_${org.id}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed === 'object' && parsed !== null) {
          setDragPositions(parsed);
        }
      }
    } catch {
      // Non-blocking
    }
  }, [org]);

  // Persist positions on change (debounced)
  const persistTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!org || Object.keys(dragPositions).length === 0) return;
    if (persistTimeout.current) clearTimeout(persistTimeout.current);
    persistTimeout.current = setTimeout(() => {
      try {
        localStorage.setItem(`aether_graph_positions_${org.id}`, JSON.stringify(dragPositions));
      } catch {
        // Non-blocking
      }
    }, 300);
    return () => {
      if (persistTimeout.current) clearTimeout(persistTimeout.current);
    };
  }, [dragPositions, org]);

  // Keyboard undo: Ctrl/Cmd+Z
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && activeTab === 'graph') {
        e.preventDefault();
        const prev = undoStack.current.pop();
        if (prev) {
          setDragPositions(prev);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTab]);

  const handleResetLayout = () => {
    undoStack.current.push({ ...dragPositions });
    setDragPositions({});
    setGraphScale(1);
    setGraphTranslate({ x: 0, y: 0 });
    if (org) {
      try {
        localStorage.removeItem(`aether_graph_positions_${org.id}`);
      } catch {
        // Non-blocking
      }
    }
  };

  // Pan handlers
  const handlePanStart = useCallback((e: React.MouseEvent) => {
    // Middle-click or Ctrl+left-click starts pan
    if (e.button === 1 || (e.button === 0 && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY, tx: graphTranslate.x, ty: graphTranslate.y };
    }
  }, [graphTranslate]);

  const handlePanMove = useCallback((e: React.MouseEvent) => {
    if (isPanning.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setGraphTranslate({ x: panStart.current.tx + dx, y: panStart.current.ty + dy });
    }
    if (isDragging.current) {
      dragMoved.current = true;
      const nodeId = isDragging.current;
      const rect = graphContainerRef.current?.getBoundingClientRect();
      if (rect) {
        const x = (e.clientX - rect.left - graphTranslate.x) / graphScale - dragOffset.current.x;
        const y = (e.clientY - rect.top - graphTranslate.y) / graphScale - dragOffset.current.y;
        setDragPositions((prev) => ({ ...prev, [nodeId]: { x, y } }));
      }
    }
  }, [graphScale, graphTranslate]);

  const handlePanEnd = useCallback(() => {
    isPanning.current = false;
    if (isDragging.current) {
      // If we didn't actually move, pop the undo stack (we pushed on mousedown)
      if (!dragMoved.current && undoStack.current.length > 0) {
        undoStack.current.pop();
      }
      isDragging.current = null;
    }
  }, []);

  // Zoom handler — attached via React onWheel (passive: false by default in React)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = -e.deltaY * 0.0015;
    setGraphScale((prev) => Math.min(2, Math.max(0.4, prev + delta)));
  }, []);

  // Node drag start
  const handleNodeDragStart = useCallback((e: React.MouseEvent, nodeId: string, nodePos: { x: number; y: number }) => {
    if (e.ctrlKey || e.metaKey || e.button !== 0) return; // Don't drag during pan
    e.stopPropagation();
    const rect = graphContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = (e.clientX - rect.left - graphTranslate.x) / graphScale;
    const mouseY = (e.clientY - rect.top - graphTranslate.y) / graphScale;
    dragOffset.current = { x: mouseX - nodePos.x, y: mouseY - nodePos.y };
    undoStack.current.push({ ...dragPositions });
    if (undoStack.current.length > 20) undoStack.current.shift();
    isDragging.current = nodeId;
    dragMoved.current = false;
  }, [graphScale, graphTranslate, dragPositions]);

  // Compute connected node IDs for selection focus
  const connectedNodeIds = useMemo(() => {
    if (!selectedTypeId) return null;
    const ids = new Set<string>([selectedTypeId]);
    for (const rel of relationshipTypes) {
      if (rel.from_type_id === selectedTypeId) ids.add(rel.to_type_id);
      if (rel.to_type_id === selectedTypeId) ids.add(rel.from_type_id);
    }
    return ids;
  }, [selectedTypeId, relationshipTypes]);

  const selectedType = selectedTypeId ? (entityTypes.find((et) => et.id === selectedTypeId) || null) : null;
  const entitiesForType = selectedType
    ? entities.filter((e) => e.entity_type_id === selectedType.id)
    : [];
  const relationshipCountByType = useMemo(() => {
    const map: Record<string, number> = {};
    entityTypes.forEach((et) => {
      map[et.id] = relationshipTypes.filter(
        (r) => r.from_type_id === et.id || r.to_type_id === et.id,
      ).length;
    });
    return map;
  }, [entityTypes, relationshipTypes]);

  const { positions, nodeSizes, width, height } = useGraphLayout(entityTypes, entities, relationshipCountByType);

  const selectedEntity = selectedEntityId
    ? entities.find((e) => e.id === selectedEntityId) ?? null
    : null;
  const selectedEntityType = selectedEntity
    ? entityTypes.find((et) => et.id === selectedEntity.entity_type_id) ?? null
    : null;

  const relationshipGroups = useMemo(
    () =>
      relationshipTypes
        .map((relType) => {
          const seen = new Set<string>();
          const items: { from: string; to: string }[] = [];
          relationships.forEach((rel) => {
            if (rel.relationship_type_id !== relType.id) return;
            const fromEntity = entities.find((e) => e.id === rel.from_entity_id);
            const toEntity = entities.find((e) => e.id === rel.to_entity_id);
            if (!fromEntity || !toEntity) return;
            const key = `${fromEntity.id}:${toEntity.id}`;
            if (seen.has(key)) return;
            seen.add(key);
            items.push({ from: fromEntity.name, to: toEntity.name });
          });
          if (items.length === 0) return null;
          return { type: relType, items };
        })
        .filter((group): group is { type: RelationshipType; items: { from: string; to: string }[] } => group != null),
    [relationshipTypes, relationships, entities],
  );

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
      .then(({ data }: { data: { id: string; file_name: string }[] | null }) => {
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
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="h-6 w-32 rounded-full bg-zinc-800" />
            <div className="mt-2 h-3 w-56 rounded-full bg-zinc-900" />
          </div>
          <div className="h-9 w-40 rounded-2xl border border-zinc-800 bg-zinc-950" />
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden animate-pulse"
            >
              <div className="px-6 pt-5 pb-3 flex items-center gap-3 border-b border-zinc-800/60">
                <div className="h-10 w-10 rounded-2xl bg-zinc-800" />
                <div className="h-4 w-24 rounded-full bg-zinc-800" />
              </div>
              <div className="px-4 py-4 space-y-3">
                <div className="h-10 rounded-2xl bg-zinc-900" />
                <div className="h-10 rounded-2xl bg-zinc-900" />
                <div className="h-10 rounded-2xl bg-zinc-900" />
              </div>
              <div className="px-6 py-3 border-t border-zinc-800/50">
                <div className="h-3 w-32 rounded-full bg-zinc-900" />
              </div>
            </div>
          ))}
        </div>
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
            {entityTypes.length === 0 || entities.length === 0
              ? 'Connect your data and Aether will map your business.'
              : `Aether found ${entities.length} entries across ${entityTypes.length} categories in your business.`}
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
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-emerald-300">
                  Aether mapped your business automatically
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  Found {entityTypes.length} categories (
                  {entityTypes.map((et) => et.name).join(', ')}), {entities.length} unique entries, and{' '}
                  {relationshipTypes.length} connections from your data.
                </div>
              </div>
            </div>
          </div>
        )}

      {activeTab === 'overview' && (
        <div className="space-y-8">
          {entityTypes.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            >
              <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950 px-10 py-16 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 p-3">
                  <Network className="h-12 w-12 text-emerald-400" />
                </div>
                <h2 className="text-lg font-semibold tracking-tight text-slate-100">
                  Aether will map your business automatically
                </h2>
                <p className="mt-2 max-w-sm text-sm text-slate-400">
                  Once you connect a spreadsheet, we&apos;ll detect your team members, locations, products, and how they all relate.
                  No setup needed.
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
            </motion.div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {entityTypes.map((et, index) => {
                  const IconComponent = ICON_MAP[et.icon?.toLowerCase()] ?? Circle;
                  const typeEntities = entities.filter((e) => e.entity_type_id === et.id);
                  const metrics = typeEntities
                    .map((e) => {
                      const sorted = entityPropertiesSorted(e, et);
                      const primary = sorted[0];
                      if (!primary) {
                        return null;
                      }
                      const raw = primary.value;
                      const n =
                        typeof raw === 'number'
                          ? raw
                          : Number(String(raw).replace(/[,$%]/g, ''));
                      const numeric = Number.isNaN(n) ? 0 : n;
                      return { entity: e, primary, numeric };
                    })
                    .filter((m): m is { entity: Entity; primary: { key: string; label: string; value: unknown; type: PropertyType }; numeric: number } => m != null);
                  const sortedMetrics = [...metrics].sort((a, b) => b.numeric - a.numeric);
                  const totalValue = sortedMetrics.reduce((sum, m) => sum + m.numeric, 0);
                  const maxValue = sortedMetrics[0]?.numeric ?? 0;
                  const visibleMetrics = sortedMetrics.slice(0, 5);
                  const remainingCount = sortedMetrics.length - visibleMetrics.length;
                  const primaryType = sortedMetrics[0]?.primary.type;
                  const formatTotal = (value: number) =>
                    primaryType
                      ? formatPropertyValue(value, primaryType)
                      : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
                  const avgValue =
                    sortedMetrics.length > 0 ? totalValue / sortedMetrics.length : 0;
                  return (
                    <motion.div
                      key={et.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: index * 0.1, ease: 'easeOut' }}
                      className="rounded-2xl border border-zinc-800 bg-zinc-950 p-0 overflow-hidden transition-all duration-300 hover:border-zinc-700"
                    >
                      <div className="px-6 pt-5 pb-3 flex items-center gap-3 border-b border-zinc-800/60">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-2xl shrink-0"
                          style={{ backgroundColor: `${et.color}1A` }}
                        >
                          <IconComponent className="h-5 w-5" style={{ color: et.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-base font-semibold tracking-tight text-slate-100">
                            {et.name}
                          </div>
                        </div>
                        <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-[11px] font-medium text-slate-400">
                          {typeEntities.length} total
                        </span>
                      </div>

                      <div className="px-4 pb-3">
                        {sortedMetrics.length === 0 ? (
                          <div className="mt-3 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 px-3 py-3 text-xs text-slate-500 text-center">
                            No metrics yet for this category.
                          </div>
                        ) : (
                          <div className="mt-3 rounded-2xl bg-zinc-900/50 overflow-hidden">
                            {visibleMetrics.map((m, idx) => {
                              const sharePct =
                                totalValue > 0 ? (m.numeric / totalValue) * 100 : 0;
                              const widthPct =
                                maxValue > 0 ? `${(m.numeric / maxValue) * 100}%` : '0%';
                              return (
                                <button
                                  key={m.entity.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedEntityId(m.entity.id);
                                  }}
                                  className={cn(
                                    'w-full px-3 py-3 text-left transition-colors',
                                    idx === 0 ? 'rounded-t-2xl' : '',
                                    idx === visibleMetrics.length - 1 &&
                                      remainingCount <= 0
                                      ? 'rounded-b-2xl'
                                      : '',
                                    'border-b border-zinc-800/50 last:border-b-0 hover:bg-zinc-900/80',
                                  )}
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="truncate text-sm font-medium text-slate-200">
                                      {m.entity.name}
                                    </span>
                                    <span className="text-sm font-semibold text-slate-100">
                                      {formatPropertyValue(
                                        m.primary.value,
                                        m.primary.type,
                                      )}
                                    </span>
                                  </div>
                                  <div className="mt-2 flex items-center">
                                    <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                                      <div
                                        className="h-full rounded-full"
                                        style={{
                                          width: widthPct,
                                          backgroundColor: `${et.color}CC`,
                                        }}
                                      />
                                    </div>
                                    <span className="ml-2 text-[10px] text-slate-500">
                                      {sharePct.toFixed(1)}%
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                            {remainingCount > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const next = sortedMetrics
                                    .slice(visibleMetrics.length)
                                    .map((m) => m.entity.id)[0];
                                  if (next) setSelectedEntityId(next);
                                }}
                                className="w-full px-3 py-2 text-center text-xs text-slate-500 hover:bg-zinc-900/70 rounded-b-2xl"
                              >
                                + {remainingCount} more
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between border-t border-zinc-800/50 px-6 py-3">
                        <div className="flex items-center text-xs text-slate-400">
                          <span>
                            Total:{' '}
                            <span className="font-medium text-slate-300">
                              {formatTotal(totalValue)}
                            </span>
                          </span>
                          <span className="mx-2 text-zinc-600">·</span>
                          <span>
                            Avg:{' '}
                            <span className="font-medium text-slate-300">
                              {formatTotal(avgValue)}
                            </span>
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('graph');
                            setSelectedTypeId(et.id);
                          }}
                          className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                        >
                          View all →
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
              {relationshipGroups.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-medium text-slate-300">
                    How things connect
                  </h3>
                  <div className="space-y-3">
                    {relationshipGroups.map((group) => {
                      const visible = group.items.slice(0, 5);
                      const extra = group.items.length - visible.length;
                      return (
                        <div key={group.type.id} className="space-y-1.5">
                          <div className="text-xs font-medium text-slate-400">
                            {group.type.name.replace(/_/g, ' ')} ({group.items.length})
                          </div>
                          <div className="space-y-1.5">
                            {visible.map((item, idx) => (
                              <div
                                key={`${item.from}-${item.to}-${idx}`}
                                className="flex flex-wrap items-center gap-2"
                              >
                                <span className="rounded-lg bg-zinc-900 border border-zinc-800 px-2.5 py-1.5 text-xs font-medium text-slate-200">
                                  {item.from}
                                </span>
                                <span className="flex items-center gap-1">
                                  <div className="h-px w-4 bg-zinc-600" />
                                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-slate-400 font-medium whitespace-nowrap">
                                    {group.type.name.replace(/_/g, ' ')}
                                  </span>
                                  <div className="h-px w-4 bg-zinc-600" />
                                </span>
                                <span className="rounded-lg bg-zinc-900 border border-zinc-800 px-2.5 py-1.5 text-xs font-medium text-slate-200">
                                  {item.to}
                                </span>
                              </div>
                            ))}
                            {extra > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab('graph');
                                }}
                                className="text-xs text-slate-500 hover:text-slate-300"
                              >
                                + {extra} more
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'graph' && (
        <div className="flex gap-0 overflow-hidden rounded-2xl border border-zinc-800 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]" style={{ backgroundColor: GRAPH.bg }}>
          <div
            ref={graphContainerRef}
            className="relative flex-1 overflow-hidden select-none"
            style={{
              backgroundImage: `radial-gradient(circle, ${GRAPH.gridDot} 0.75px, transparent 0.75px)`,
              backgroundSize: `${GRAPH.gridSize}px ${GRAPH.gridSize}px`,
              minHeight: 560,
              boxShadow: 'inset 0 0 80px 40px rgba(0,0,0,0.35)',
              cursor: isPanning.current ? 'grabbing' : 'default',
            }}
            onMouseDown={handlePanStart}
            onMouseMove={handlePanMove}
            onMouseUp={handlePanEnd}
            onMouseLeave={handlePanEnd}
            onWheel={handleWheel}
            onContextMenu={(e) => e.preventDefault()}
            onClick={(e) => {
              // Click on background (not on a node) deselects
              if (e.target === e.currentTarget || e.target === graphContainerRef.current) {
                setSelectedTypeId(null);
              }
            }}
          >
            {/* Graph controls */}
            <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setGraphScale((s) => Math.min(2, s + 0.15))}
                className="rounded-lg border border-zinc-700/50 px-2 py-1 text-[10px] font-mono text-slate-400 hover:bg-zinc-800/50 hover:text-slate-300 transition-colors"
                style={{ backgroundColor: GRAPH.edgeLabelBg }}
              >
                +
              </button>
              <button
                type="button"
                onClick={() => setGraphScale((s) => Math.max(0.4, s - 0.15))}
                className="rounded-lg border border-zinc-700/50 px-2 py-1 text-[10px] font-mono text-slate-400 hover:bg-zinc-800/50 hover:text-slate-300 transition-colors"
                style={{ backgroundColor: GRAPH.edgeLabelBg }}
              >
                −
              </button>
              <button
                type="button"
                onClick={handleResetLayout}
                className="rounded-lg border border-zinc-700/50 px-2.5 py-1 text-[10px] text-slate-500 hover:bg-zinc-800/50 hover:text-slate-300 transition-colors"
                style={{ backgroundColor: GRAPH.edgeLabelBg }}
              >
                Reset
              </button>
              <span className="ml-1 text-[9px] font-mono tabular-nums text-slate-600">
                {Math.round(graphScale * 100)}%
              </span>
            </div>

            {/* Interaction hints */}
            {entityTypes.length > 0 && (
              <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 text-[9px] text-slate-600">
                <span>Drag nodes to arrange</span>
                <span>·</span>
                <span>Scroll to zoom</span>
                <span>·</span>
                <span>Ctrl+Z to undo</span>
              </div>
            )}

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
                  className="relative shrink-0 origin-top-left transition-transform duration-75"
                  style={{
                    width,
                    height,
                    minHeight: height,
                    transform: `translate(${graphTranslate.x}px, ${graphTranslate.y}px) scale(${graphScale})`,
                  }}
                >
                  <svg
                    className="absolute left-0 top-0 pointer-events-none"
                    width={width}
                    height={height}
                  >
                    {/* Arrow marker definition */}
                    <defs>
                      <marker
                        id="graph-arrow"
                        viewBox="0 0 6 4"
                        refX="5"
                        refY="2"
                        markerWidth="6"
                        markerHeight="4"
                        orient="auto"
                      >
                        <path d="M0,0 L6,2 L0,4 Z" fill={GRAPH.edgeDefault} />
                      </marker>
                      <marker
                        id="graph-arrow-active"
                        viewBox="0 0 6 4"
                        refX="5"
                        refY="2"
                        markerWidth="6"
                        markerHeight="4"
                        orient="auto"
                      >
                        <path d="M0,0 L6,2 L0,4 Z" fill={GRAPH.edgeActive} />
                      </marker>
                    </defs>
                    {(() => {
                      // Count how many relationship types share the same node pair
                      const pairCounts = new Map<string, number>();
                      const pairIndex = new Map<string, number>();
                      for (const rel of relationshipTypes) {
                        const key = [rel.from_type_id, rel.to_type_id].sort().join(':');
                        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
                      }

                      return relationshipTypes.map((rel) => {
                        const fromPos = dragPositions[rel.from_type_id] ?? positions[rel.from_type_id];
                        const toPos = dragPositions[rel.to_type_id] ?? positions[rel.to_type_id];
                        if (!fromPos || !toPos) return null;

                        // Selection focus: fade edges not connected to selected node
                        const isEdgeConnected = !connectedNodeIds || (connectedNodeIds.has(rel.from_type_id) && connectedNodeIds.has(rel.to_type_id));
                        const edgeFocusOpacity = connectedNodeIds ? (isEdgeConnected ? 1 : 0.12) : 1;

                        // Count actual entity relationships for this relationship type
                        const relEntityCount = relationships.filter(
                          (r) => r.relationship_type_id === rel.id,
                        ).length;

                        // Encode strength
                        const strokeWidth = relEntityCount >= 21 ? 2.5 : relEntityCount >= 6 ? 1.5 : 1;
                        const strokeOpacity = Math.min(0.7, 0.25 + (relEntityCount / 30) * 0.45);

                        // Handle parallel edges — offset with Bézier curve
                        const pairKey = [rel.from_type_id, rel.to_type_id].sort().join(':');
                        const totalForPair = pairCounts.get(pairKey) ?? 1;
                        const currentIdx = pairIndex.get(pairKey) ?? 0;
                        pairIndex.set(pairKey, currentIdx + 1);

                        const x1 = fromPos.x;
                        const y1 = fromPos.y;
                        const x2 = toPos.x;
                        const y2 = toPos.y;

                        // Compute perpendicular offset for parallel edges
                        const dx = x2 - x1;
                        const dy = y2 - y1;
                        const len = Math.sqrt(dx * dx + dy * dy) || 1;
                        const nx = -dy / len; // perpendicular unit vector
                        const ny = dx / len;
                        const offsetAmount = totalForPair > 1
                          ? (currentIdx - (totalForPair - 1) / 2) * 28
                          : 0;

                        const cx = (x1 + x2) / 2 + nx * offsetAmount;
                        const cy = (y1 + y2) / 2 + ny * offsetAmount;

                        // Label position (on the curve midpoint)
                        const labelX = cx;
                        const labelY = cy;

                        const useCurve = totalForPair > 1;
                        const pathD = useCurve
                          ? `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`
                          : `M ${x1} ${y1} L ${x2} ${y2}`;

                        return (
                          <g key={rel.id} style={{ opacity: edgeFocusOpacity, transition: 'opacity 200ms ease' }}>
                            <path
                              d={pathD}
                              fill="none"
                              stroke={GRAPH.edgeDefault}
                              strokeWidth={strokeWidth}
                              strokeOpacity={strokeOpacity}
                              markerEnd="url(#graph-arrow)"
                            />
                            {/* Label background pill */}
                            <rect
                              x={labelX - (rel.name.length * 3.2 + 16)}
                              y={labelY - 8}
                              width={rel.name.length * 6.4 + 32}
                              height={16}
                              rx={4}
                              fill={GRAPH.edgeLabelBg}
                              stroke={GRAPH.nodeBorder}
                              strokeWidth={0.5}
                            />
                            <text
                              x={labelX}
                              y={labelY}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fill={GRAPH.edgeLabel}
                              style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.01em' }}
                            >
                              {rel.name}{relEntityCount > 0 ? ` (${relEntityCount})` : ''}
                            </text>
                          </g>
                        );
                      });
                    })()}
                  </svg>
                  <div className="absolute left-0 top-0" style={{ width, height }}>
                  {entityTypes.map((et) => {
                    const layoutPos = positions[et.id];
                    if (!layoutPos) return null;
                    const nodePos = dragPositions[et.id] ?? layoutPos;
                    const IconComponent = ICON_MAP[et.icon.toLowerCase()] ?? Circle;
                    const typeEntities = entities.filter((e) => e.entity_type_id === et.id);
                    const count = typeEntities.length;
                    const isSelected = selectedTypeId === et.id;
                    const size = nodeSizes[et.id] ?? { w: 200, h: 90, tier: 'md' };
                    const micro = computeMicroMetrics(et, typeEntities);
                    const relCount = relationshipCountByType[et.id] ?? 0;
                    const maxEntityCount = Math.max(1, ...entityTypes.map((t) => entities.filter((e) => e.entity_type_id === t.id).length));
                    const barPct = Math.round((count / maxEntityCount) * 100);

                    // Selection focus: fade nodes not connected to selected
                    const isConnected = !connectedNodeIds || connectedNodeIds.has(et.id);
                    const nodeFocusOpacity = connectedNodeIds ? (isConnected ? 1 : 0.25) : 1;

                    return (
                      <button
                        key={et.id}
                        type="button"
                        onClick={() => {
                          if (!dragMoved.current) setSelectedTypeId(et.id);
                        }}
                        onMouseDown={(e) => handleNodeDragStart(e, et.id, nodePos)}
                        className="absolute rounded-xl border shadow-md focus:outline-none"
                        style={{
                          left: nodePos.x - size.w / 2,
                          top: nodePos.y - size.h / 2,
                          width: size.w,
                          height: size.h,
                          borderColor: isSelected ? GRAPH.nodeSelectedBorder : GRAPH.nodeBorder,
                          backgroundColor: GRAPH.nodeBg,
                          borderLeftWidth: '3px',
                          borderLeftColor: `color-mix(in srgb, ${et.color} ${Math.round(GRAPH.accentOpacity * 100)}%, transparent)`,
                          opacity: nodeFocusOpacity,
                          transition: 'opacity 200ms ease, border-color 150ms ease',
                          cursor: isDragging.current === et.id ? 'grabbing' : 'grab',
                        }}
                      >
                        <div className="flex flex-col gap-1 px-3 py-2 h-full justify-center">
                          {/* Row 1: icon + name + count */}
                          <div className="flex items-center gap-2">
                            <IconComponent className="h-3.5 w-3.5 shrink-0" style={{ color: et.color }} />
                            <span className="truncate text-xs font-semibold leading-tight" style={{ color: GRAPH.nodeTextPrimary }}>{et.name}</span>
                            <span className="ml-auto rounded bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-mono tabular-nums" style={{ color: GRAPH.nodeTextSecondary }}>
                              {count}
                            </span>
                          </div>
                          {/* Row 2: micro-metrics */}
                          {micro.items.length > 0 && (
                            <div className="flex items-center gap-2 pl-5.5">
                              {micro.items.map((m, mi) => (
                                <span key={mi} className="text-[10px] tabular-nums" style={{ color: GRAPH.nodeTextMetric }}>
                                  {m.value} <span style={{ color: GRAPH.nodeTextSecondary }}>{m.label.toLowerCase()}</span>
                                  {mi < micro.items.length - 1 && <span className="mx-0.5" style={{ color: GRAPH.nodeBorder }}>·</span>}
                                </span>
                              ))}
                            </div>
                          )}
                          {/* Row 3: mini bar + connections */}
                          <div className="flex items-center gap-2 pl-5.5">
                            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${barPct}%`,
                                  backgroundColor: `color-mix(in srgb, ${et.color} 40%, transparent)`,
                                }}
                              />
                            </div>
                            {relCount > 0 && (
                              <span className="text-[9px] tabular-nums whitespace-nowrap" style={{ color: GRAPH.nodeTextSecondary }}>
                                {relCount} conn
                              </span>
                            )}
                          </div>
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
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 shadow-[0_0_0_1px_rgba(24,24,27,0.9)] overflow-hidden">
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
            className="max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
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

      <EntityDetailPanel
        entity={selectedEntity}
        entityType={selectedEntityType}
        allEntities={entities}
        allRelationshipTypes={relationshipTypes}
        allEntityRelationships={relationships as EntityRelationship[]}
        allEntityTypes={entityTypes}
        onClose={() => setSelectedEntityId(null)}
        onSelectEntity={(id) => setSelectedEntityId(id)}
      />
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
      <div className="relative w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl">
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
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl">
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
