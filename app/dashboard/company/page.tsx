'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Users,
  Plus,
  Upload,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  Edit2,
  Tag,
  Shield,
  UserPlus,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types mirroring server-side ────────────────────────────────────────

interface CompanyRole {
  id: string;
  key: string;
  label: string;
}

interface CompanyTag {
  id: string;
  slug: string;
  label: string;
  color: string;
}

interface CompanyPerson {
  id: string;
  display_name: string;
  canonical_name: string;
  email: string | null;
  phone: string | null;
  status: 'active' | 'inactive';
  source: 'manual' | 'upload' | 'integration';
  notes: string | null;
  created_at: string;
  updated_at: string;
  roles: { id: string; role_id: string; role?: CompanyRole }[];
  tags: { id: string; tag_id: string; tag?: CompanyTag }[];
  aliases: { id: string; person_id: string; alias: string; canonical_alias: string }[];
}

// ── Main page ──────────────────────────────────────────────────────────

export default function CompanyDirectoryPage() {
  const [people, setPeople] = useState<CompanyPerson[]>([]);
  const [roles, setRoles] = useState<CompanyRole[]>([]);
  const [tags, setTags] = useState<CompanyTag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal states
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [editingPerson, setEditingPerson] = useState<CompanyPerson | null>(null);
  const [expandedPersonId, setExpandedPersonId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Data loading ──────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/company');
      if (!res.ok) throw new Error('Failed to load directory');
      const data = await res.json() as { people: CompanyPerson[]; roles: CompanyRole[]; tags: CompanyTag[] };
      setPeople(data.people);
      setRoles(data.roles);
      setTags(data.tags);
    } catch {
      toast.error('Failed to load Company Directory');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ── Filtering ─────────────────────────────────────────────────────────

  const filteredPeople = people.filter((p) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        p.display_name.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q) ||
        p.roles.some((r) => r.role?.label.toLowerCase().includes(q)) ||
        p.tags.some((t) => t.tag?.label.toLowerCase().includes(q)) ||
        p.aliases.some((a) => a.alias.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // ── Add person ────────────────────────────────────────────────────────

  const handleAddPerson = async (formData: {
    display_name: string;
    email: string;
    phone: string;
    role_keys: string[];
    tag_slugs: string[];
  }) => {
    try {
      const res = await fetch('/api/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Failed to add person');
      }
      toast.success(`Added ${formData.display_name}`);
      setShowAddPerson(false);
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add person');
    }
  };

  // ── Update person ─────────────────────────────────────────────────────

  const handleUpdatePerson = async (personId: string, updates: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', person_id: personId, ...updates }),
      });
      if (!res.ok) throw new Error('Update failed');
      toast.success('Updated');
      setEditingPerson(null);
      await loadData();
    } catch {
      toast.error('Failed to update person');
    }
  };

  // ── Toggle status ─────────────────────────────────────────────────────

  const handleToggleStatus = async (person: CompanyPerson) => {
    const newStatus = person.status === 'active' ? 'inactive' : 'active';
    await handleUpdatePerson(person.id, { status: newStatus });
  };

  // ── Add alias ─────────────────────────────────────────────────────────

  const handleAddAlias = async (personId: string, alias: string) => {
    try {
      const res = await fetch('/api/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_alias', person_id: personId, alias }),
      });
      if (!res.ok) throw new Error('Failed to add alias');
      toast.success(`Alias added: ${alias}`);
      await loadData();
    } catch {
      toast.error('Failed to add alias');
    }
  };

  // ── Remove alias ──────────────────────────────────────────────────────

  const handleRemoveAlias = async (aliasId: string) => {
    try {
      const res = await fetch('/api/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove_alias', alias_id: aliasId }),
      });
      if (!res.ok) throw new Error('Failed to remove alias');
      await loadData();
    } catch {
      toast.error('Failed to remove alias');
    }
  };

  // ── Import roster ─────────────────────────────────────────────────────

  const handleImport = async (file: File) => {
    try {
      setShowImport(true);
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/company/import', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Import failed');
      }
      const result = await res.json() as { created: number; updated: number; skipped: number; errors: string[] };
      toast.success(`Imported: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`);
      setShowImport(false);
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed');
      setShowImport(false);
    }
  };

  // ── Stats ─────────────────────────────────────────────────────────────

  const activeCount = people.filter((p) => p.status === 'active').length;
  const inactiveCount = people.filter((p) => p.status === 'inactive').length;

  // ── Render ────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Company Directory</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {people.length} {people.length === 1 ? 'person' : 'people'} &middot; {activeCount} active
            {inactiveCount > 0 && ` \u00B7 ${inactiveCount} inactive`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImport(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={showImport}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-zinc-300 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 hover:border-zinc-700 transition-colors disabled:opacity-50"
          >
            {showImport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Import Staff
          </button>
          <button
            type="button"
            onClick={() => setShowAddPerson(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-500 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Person
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by name, email, role, tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 p-0.5 bg-zinc-900 border border-zinc-800 rounded-lg">
          {(['all', 'active', 'inactive'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                statusFilter === s
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Directory table */}
      {filteredPeople.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border border-zinc-800 rounded-xl bg-zinc-950/50">
          <Users className="w-10 h-10 text-zinc-700 mb-3" />
          <p className="text-zinc-400 text-sm font-medium">
            {people.length === 0
              ? 'No staff in your directory yet'
              : 'No results match your filters'}
          </p>
          <p className="text-zinc-600 text-xs mt-1">
            {people.length === 0
              ? 'Add people manually or import a staff roster.'
              : 'Try adjusting your search or filter.'}
          </p>
          {people.length === 0 && (
            <div className="flex items-center gap-2 mt-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                Import Roster
              </button>
              <button
                type="button"
                onClick={() => setShowAddPerson(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-500 transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Add Person
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/50">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_160px_160px_120px_80px] gap-4 px-5 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider border-b border-zinc-800/50 bg-zinc-900/30">
            <span>Name</span>
            <span>Roles</span>
            <span>Tags</span>
            <span>Source</span>
            <span className="text-center">Status</span>
          </div>

          {/* Table rows */}
          {filteredPeople.map((person) => (
            <PersonRow
              key={person.id}
              person={person}
              isExpanded={expandedPersonId === person.id}
              onToggleExpand={() =>
                setExpandedPersonId(expandedPersonId === person.id ? null : person.id)
              }
              onEdit={() => setEditingPerson(person)}
              onToggleStatus={() => void handleToggleStatus(person)}
              onAddAlias={(alias) => void handleAddAlias(person.id, alias)}
              onRemoveAlias={(aliasId) => void handleRemoveAlias(aliasId)}
            />
          ))}
        </div>
      )}

      {/* Add person modal */}
      {showAddPerson && (
        <AddPersonModal
          roles={roles}
          tags={tags}
          onClose={() => setShowAddPerson(false)}
          onSubmit={handleAddPerson}
        />
      )}

      {/* Edit person modal */}
      {editingPerson && (
        <EditPersonModal
          person={editingPerson}
          onClose={() => setEditingPerson(null)}
          onSubmit={(updates) => void handleUpdatePerson(editingPerson.id, updates)}
        />
      )}
    </div>
  );
}

// ── Person row ──────────────────────────────────────────────────────────

function PersonRow({
  person,
  isExpanded,
  onToggleExpand,
  onEdit,
  onToggleStatus,
  onAddAlias,
  onRemoveAlias,
}: {
  person: CompanyPerson;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onToggleStatus: () => void;
  onAddAlias: (alias: string) => void;
  onRemoveAlias: (aliasId: string) => void;
}) {
  const [newAlias, setNewAlias] = useState('');

  return (
    <div className="border-b border-zinc-800/30 last:border-b-0">
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full grid grid-cols-[1fr_160px_160px_120px_80px] gap-4 px-5 py-3 text-left hover:bg-zinc-900/40 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-zinc-800 text-xs font-medium text-zinc-300 flex-shrink-0">
            {person.display_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <span className="text-sm font-medium text-zinc-200 truncate block">
              {person.display_name}
            </span>
            {person.email && (
              <span className="text-xs text-zinc-500 truncate block">{person.email}</span>
            )}
          </div>
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {person.roles.slice(0, 2).map((ra) => (
            <span
              key={ra.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-cyan-950/40 text-cyan-400 border border-cyan-900/30 rounded-md"
            >
              <Shield className="w-3 h-3" />
              {ra.role?.label ?? ra.role_id.slice(0, 6)}
            </span>
          ))}
          {person.roles.length > 2 && (
            <span className="text-[11px] text-zinc-500">+{person.roles.length - 2}</span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {person.tags.slice(0, 2).map((ta) => (
            <span
              key={ta.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-zinc-800/60 text-zinc-300 rounded-md"
              style={ta.tag?.color ? { borderLeft: `2px solid ${ta.tag.color}` } : undefined}
            >
              <Tag className="w-3 h-3" />
              {ta.tag?.label ?? ta.tag_id.slice(0, 6)}
            </span>
          ))}
          {person.tags.length > 2 && (
            <span className="text-[11px] text-zinc-500">+{person.tags.length - 2}</span>
          )}
        </div>
        <span className="text-xs text-zinc-500 capitalize">{person.source}</span>
        <div className="flex justify-center">
          {person.status === 'active' ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500">
              <XCircle className="w-3.5 h-3.5" />
              Inactive
            </span>
          )}
        </div>
      </button>

      {/* Expanded detail row */}
      {isExpanded && (
        <div className="px-5 pb-4 pt-1 bg-zinc-900/20 border-t border-zinc-800/20">
          <div className="grid grid-cols-3 gap-6 text-xs">
            {/* Info column */}
            <div className="space-y-2">
              <h4 className="font-medium text-zinc-400 uppercase tracking-wider text-[10px]">Details</h4>
              <div className="space-y-1.5">
                {person.email && (
                  <div className="text-zinc-400">
                    <span className="text-zinc-600">Email:</span> {person.email}
                  </div>
                )}
                {person.phone && (
                  <div className="text-zinc-400">
                    <span className="text-zinc-600">Phone:</span> {person.phone}
                  </div>
                )}
                {person.notes && (
                  <div className="text-zinc-400">
                    <span className="text-zinc-600">Notes:</span> {person.notes}
                  </div>
                )}
                <div className="text-zinc-600">
                  Added {new Date(person.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* Aliases column */}
            <div className="space-y-2">
              <h4 className="font-medium text-zinc-400 uppercase tracking-wider text-[10px]">
                Aliases ({person.aliases.length})
              </h4>
              <div className="space-y-1">
                {person.aliases.map((a) => (
                  <div key={a.id} className="flex items-center justify-between group">
                    <span className="text-zinc-400 font-mono text-[11px]">{a.alias}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveAlias(a.id)}
                      className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-1.5 mt-1.5">
                  <input
                    type="text"
                    placeholder="Add alias..."
                    value={newAlias}
                    onChange={(e) => setNewAlias(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newAlias.trim()) {
                        onAddAlias(newAlias.trim());
                        setNewAlias('');
                      }
                    }}
                    className="flex-1 px-2 py-1 text-[11px] bg-zinc-900 border border-zinc-800 rounded text-zinc-300 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newAlias.trim()) {
                        onAddAlias(newAlias.trim());
                        setNewAlias('');
                      }
                    }}
                    className="px-1.5 py-1 text-zinc-600 hover:text-zinc-300 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Actions column */}
            <div className="space-y-2">
              <h4 className="font-medium text-zinc-400 uppercase tracking-wider text-[10px]">Actions</h4>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={onEdit}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 bg-zinc-800/60 border border-zinc-700/50 rounded-md hover:bg-zinc-800 transition-colors w-fit"
                >
                  <Edit2 className="w-3 h-3" />
                  Edit Details
                </button>
                <button
                  type="button"
                  onClick={onToggleStatus}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-colors w-fit ${
                    person.status === 'active'
                      ? 'text-amber-400 bg-amber-950/30 border border-amber-900/30 hover:bg-amber-950/50'
                      : 'text-emerald-400 bg-emerald-950/30 border border-emerald-900/30 hover:bg-emerald-950/50'
                  }`}
                >
                  {person.status === 'active' ? (
                    <>
                      <XCircle className="w-3 h-3" />
                      Deactivate
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3 h-3" />
                      Reactivate
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add person modal ────────────────────────────────────────────────────

function AddPersonModal({
  roles: _roles,
  tags: _tags,
  onClose,
  onSubmit,
}: {
  roles: CompanyRole[];
  tags: CompanyTag[];
  onClose: () => void;
  onSubmit: (data: {
    display_name: string;
    email: string;
    phone: string;
    role_keys: string[];
    tag_slugs: string[];
  }) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [roleInput, setRoleInput] = useState('');
  const [tagInput, setTagInput] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-white">Add Person</h3>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onSubmit({
              display_name: name.trim(),
              email: email.trim(),
              phone: phone.trim(),
              role_keys: roleInput
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
              tag_slugs: tagInput
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            });
          }}
          className="p-5 space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Full Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              autoFocus
              required
              className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@company.com"
                className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 000 0000"
                className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Roles <span className="text-zinc-600">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={roleInput}
              onChange={(e) => setRoleInput(e.target.value)}
              placeholder="Instructor, Manager"
              className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Tags <span className="text-zinc-600">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="Yoga, Pilates"
              className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-500 transition-colors"
            >
              Add Person
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit person modal ───────────────────────────────────────────────────

function EditPersonModal({
  person,
  onClose,
  onSubmit,
}: {
  person: CompanyPerson;
  onClose: () => void;
  onSubmit: (updates: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(person.display_name);
  const [email, setEmail] = useState(person.email ?? '');
  const [phone, setPhone] = useState(person.phone ?? '');
  const [notes, setNotes] = useState(person.notes ?? '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-white">Edit Person</h3>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              display_name: name.trim(),
              email: email.trim() || null,
              phone: phone.trim() || null,
              notes: notes.trim() || null,
            });
          }}
          className="p-5 space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:border-zinc-600"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:border-zinc-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:border-zinc-600"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-500 transition-colors"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
