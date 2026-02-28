// Column mapping UI for connecting raw upload columns to Aether semantic fields.
// Includes optional step: Map to your business (create entities from this data).
'use client';

import React, { useMemo, useState } from 'react';
import { Link2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useOntology } from '@/hooks/use-ontology';

export type DataType = 'Revenue' | 'Labor' | 'Attendance' | 'Inventory' | 'Custom';

export type ColumnRole =
  | 'date'
  | 'revenue'
  | 'cost'
  | 'labor_hours'
  | 'attendance'
  | 'expected'
  | 'dimension'
  | 'category'
  | 'location'
  | 'name'
  | 'custom'
  | 'skip';

export interface OntologyConfig {
  entityTypeId: string;
  nameColumn: string;
  columnToProperty: Record<string, string>;
  relationshipColumns?: {
    column: string;
    toEntityTypeId: string;
    relationshipName: string;
  }[];
}

interface ColumnMapperProps {
  headers: string[];
  rows: Record<string, string>[];
  onImport?: (payload: {
    dataType: DataType;
    mapping: Record<string, ColumnRole>;
    ontology?: OntologyConfig | null;
  }) => void;
}

const columnRoles: { value: ColumnRole; label: string }[] = [
  { value: 'date', label: 'Date' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'cost', label: 'Cost' },
  { value: 'labor_hours', label: 'Labor hours' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'expected', label: 'Expected (Target/Capacity/Quota)' },
  { value: 'dimension', label: 'Dimension (Group by)' },
  { value: 'category', label: 'Category' },
  { value: 'location', label: 'Location' },
  { value: 'name', label: 'Name' },
  { value: 'custom', label: 'Custom' },
  { value: 'skip', label: 'Skip' },
];

const dataTypes: DataType[] = ['Revenue', 'Labor', 'Attendance', 'Inventory', 'Custom'];

function slugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'type';
}

export function ColumnMapper({ headers, rows, onImport }: ColumnMapperProps) {
  const { entityTypes, createEntityType } = useOntology();
  const [step, setStep] = useState<1 | 2>(1);
  const [dataType, setDataType] = useState<DataType>('Custom');
  const suggestedMapping = useMemo(() => {
    const hasWeekStart = headers.some((h) => {
      const n = h.toLowerCase().trim().replace(/\s+/g, ' ');
      return n.includes('week_start') || n === 'week_start' || n.includes('week start');
    });
    return headers.reduce((acc, header) => {
      const h = header.toLowerCase().trim();
      const normalized = h.replace(/\s+/g, ' ');

      if (normalized.includes('week_start') || normalized === 'week_start' || normalized.includes('week start'))
        acc[header] = 'date';
      else if (
        normalized.includes('period_start') ||
        normalized.includes('start_date') ||
        normalized.includes('date_start') ||
        (normalized.includes('week') && normalized.includes('start'))
      )
        acc[header] = 'date';
      else if (normalized.includes('week_end') && !hasWeekStart)
        acc[header] = 'date';
      else if (h.includes('date'))
        acc[header] = 'date';
      else if (h.includes('rev'))
        acc[header] = 'revenue';
      else if (h.includes('cost'))
        acc[header] = 'cost';
      else if (h.includes('labor'))
        acc[header] = 'labor_hours';
      else if (h.includes('attend') || h.includes('check'))
        acc[header] = 'attendance';
      else if (
        h.includes('target') ||
        h.includes('quota') ||
        h.includes('expected') ||
        h.includes('capacity') ||
        h.includes('potential') ||
        h.includes('max')
      )
        acc[header] = 'expected';
      else if (
        h.includes('instructor') ||
        h.includes('coach') ||
        h.includes('trainer') ||
        h.includes('staff') ||
        h.includes('rep') ||
        h.includes('sales') ||
        h.includes('region') ||
        h.includes('territory') ||
        h.includes('location') ||
        h.includes('outlet') ||
        h.includes('store') ||
        h.includes('team')
      )
        acc[header] = 'dimension';
      else if (h.includes('site'))
        acc[header] = 'location';
      else if (h.includes('name') || h.includes('member'))
        acc[header] = 'name';
      else
        acc[header] = 'custom';
      return acc;
    }, {} as Record<string, ColumnRole>);
  }, [headers]);

  const [mapping, setMapping] = useState<Record<string, ColumnRole>>(suggestedMapping);

  // Step 2: Map to your business
  const [validationError, setValidationError] = useState<string | null>(null);
  const [enableOntology, setEnableOntology] = useState(false);
  const [entityTypeId, setEntityTypeId] = useState('');
  const [newEntityTypeName, setNewEntityTypeName] = useState('');
  const [isCreatingType, setIsCreatingType] = useState(false);
  const [nameColumn, setNameColumn] = useState('');
  const [columnToProperty, setColumnToProperty] = useState<Record<string, string>>({});
  const [relationshipColumns, setRelationshipColumns] = useState<
    { column: string; toEntityTypeId: string; relationshipName: string }[]
  >([]);

  const previewRows = useMemo(() => rows.slice(0, 5), [rows]);
  const selectedEntityType = useMemo(
    () => entityTypes.find((et) => et.id === entityTypeId),
    [entityTypes, entityTypeId],
  );
  const propertyKeys = useMemo(
    () => (selectedEntityType?.properties ?? []).map((p) => p.key),
    [selectedEntityType],
  );

  const handleChangeRole = (header: string, role: ColumnRole) => {
    setMapping((prev) => ({ ...prev, [header]: role }));
    setValidationError(null);
  };

  const validateMapping = (): string | null => {
    const revenueCols = Object.values(mapping).filter((r) => r === 'revenue');
    const dimensionCols = Object.values(mapping).filter((r) => r === 'dimension');
    const dateCols = Object.values(mapping).filter((r) => r === 'date');

    if (revenueCols.length < 1) {
      return 'At least one column must be mapped to Revenue.';
    }
    if (dimensionCols.length === 0) {
      return 'Exactly one column must be mapped to Dimension (Group by).';
    }
    if (dimensionCols.length > 1) {
      return 'Only one column can be mapped to Dimension. Please map the others to a different role.';
    }
    if (dateCols.length < 1) {
      return 'At least one column must be mapped to Date for weekly grouping.';
    }
    return null;
  };

  const handleImportWithoutOntology = () => {
    const err = validateMapping();
    if (err) {
      setValidationError(err);
      toast.error(err);
      return;
    }
    setValidationError(null);
    onImport?.({ dataType, mapping, ontology: null });
  };

  const handleImportWithOntology = () => {
    const err = validateMapping();
    if (err) {
      setValidationError(err);
      toast.error(err);
      return;
    }
    setValidationError(null);
    if (!enableOntology || !entityTypeId || !nameColumn) {
      onImport?.({ dataType, mapping, ontology: null });
      return;
    }
    const filteredColumnToProperty = Object.fromEntries(
      Object.entries(columnToProperty).filter(([, propKey]: [string, string]) => propKey !== ''),
    ) as Record<string, string>;
    const ontology: OntologyConfig = {
      entityTypeId,
      nameColumn,
      columnToProperty: filteredColumnToProperty,
      relationshipColumns:
        relationshipColumns.filter((r) => r.column && r.toEntityTypeId).length > 0
          ? relationshipColumns.filter((r) => r.column && r.toEntityTypeId)
          : undefined,
    };
    onImport?.({ dataType, mapping, ontology });
  };

  const handleCreateNewType = async () => {
    const name = newEntityTypeName.trim();
    if (!name) return;
    setIsCreatingType(true);
    const created = await createEntityType({
      name,
      slug: slugFromName(name),
      icon: 'circle',
      color: '#10B981',
      properties: [],
    });
    setIsCreatingType(false);
    if (created) {
      setEntityTypeId(created.id);
      setNewEntityTypeName('');
    }
  };

  const addRelationshipColumn = () => {
    setRelationshipColumns((prev) => [
      ...prev,
      { column: headers[0] ?? '', toEntityTypeId: entityTypes[0]?.id ?? '', relationshipName: 'references' },
    ]);
  };

  const updateRelationshipColumn = (
    index: number,
    update: Partial<{ column: string; toEntityTypeId: string; relationshipName: string }>,
  ) => {
    setRelationshipColumns((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...update } : r)),
    );
  };

  if (headers.length === 0) return null;

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-950 px-6 py-5">
      {step === 1 && (
        <>
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-slate-100">
                Map your columns
              </h3>
              <p className="text-xs text-slate-500">
                Tell Aether what each column represents so we can generate accurate metrics.
              </p>
            </div>
            <div className="space-y-1 text-right">
              <label htmlFor="data-type" className="block text-xs font-medium text-slate-400">
                Data type
              </label>
              <select
                id="data-type"
                value={dataType}
                onChange={(e) => setDataType(e.target.value as DataType)}
                className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500/70"
              >
                {dataTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="space-y-2">
              {headers.map((header) => (
                <div
                  key={header}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2"
                >
                  <div className="flex-1 truncate text-xs font-medium text-slate-100">
                    {header}
                  </div>
                  <select
                    value={mapping[header]}
                    onChange={(e) => handleChangeRole(header, e.target.value as ColumnRole)}
                    className="rounded-xl border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  >
                    {columnRoles.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-200">Preview</span>
                <span className="text-[11px] text-slate-500">
                  Showing first {previewRows.length} rows
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-[11px] text-slate-200">
                  <thead>
                    <tr>
                      {headers.map((header) => (
                        <th key={header} className="border-b border-zinc-800 px-2 pb-2">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-b border-zinc-900 last:border-0">
                        {headers.map((header) => (
                          <td key={header} className="px-2 py-1 text-slate-400">
                            {row[header] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {validationError && (
            <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
              {validationError}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleImportWithoutOntology}
              className="rounded-2xl border-zinc-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-zinc-800"
            >
              Skip and import
            </Button>
            <Button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-2xl bg-emerald-500 px-5 py-2 text-xs font-medium text-slate-950 hover:bg-emerald-600"
            >
              Next: Map to your business
            </Button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="mb-4 flex items-center gap-2">
            <Link2 className="h-4 w-4 text-emerald-400" />
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-slate-100">
                Map to your business
              </h3>
              <p className="text-xs text-slate-500">
                Optionally create categories and connections from this data.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={enableOntology}
                onChange={(e) => setEnableOntology(e.target.checked)}
                className="rounded border-zinc-600 bg-zinc-900 text-emerald-500 focus:ring-emerald-500/50"
              />
              <span className="text-sm text-slate-200">
                Create entities from this data
              </span>
            </label>

            {enableOntology && (
              <>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">
                    Entity type
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={entityTypeId}
                      onChange={(e) => setEntityTypeId(e.target.value)}
                      className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                    >
                      <option value="">Select type</option>
                      {entityTypes.map((et) => (
                        <option key={et.id} value={et.id}>
                          {et.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newEntityTypeName}
                        onChange={(e) => setNewEntityTypeName(e.target.value)}
                        placeholder="Or create new"
                        className="w-36 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleCreateNewType}
                        disabled={!newEntityTypeName.trim() || isCreatingType}
                        className="rounded-xl bg-zinc-700 px-3 text-xs text-slate-200 hover:bg-zinc-600"
                      >
                        {isCreatingType ? 'Creating…' : 'Create'}
                      </Button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">
                    Name column
                  </label>
                  <select
                    value={nameColumn}
                    onChange={(e) => setNameColumn(e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                  >
                    <option value="">Which column is the entity name?</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedEntityType && (
                  <div>
                    <label className="mb-2 block text-xs font-medium text-slate-400">
                      Map columns to properties
                    </label>
                    <div className="space-y-2">
                      {headers
                        .filter((h) => h !== nameColumn)
                        .map((header) => (
                          <div
                            key={header}
                            className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2"
                          >
                            <span className="w-32 truncate text-xs text-slate-300">{header}</span>
                            <span className="text-slate-500">→</span>
                            <select
                              value={columnToProperty[header] ?? ''}
                              onChange={(e) =>
                                setColumnToProperty((prev) => ({
                                  ...prev,
                                  [header]: e.target.value,
                                }))
                              }
                              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-slate-100"
                            >
                              <option value="">— Don&apos;t map</option>
                              {propertyKeys.map((key) => (
                                <option key={key} value={key}>
                                  {key}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-400">
                      Columns that reference other categories
                    </label>
                    <button
                      type="button"
                      onClick={addRelationshipColumn}
                      className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                    >
                      + Add
                    </button>
                  </div>
                  {relationshipColumns.map((rel, index) => (
                    <div
                      key={index}
                      className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 p-2"
                    >
                      <select
                        value={rel.column}
                        onChange={(e) => updateRelationshipColumn(index, { column: e.target.value })}
                        className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-slate-100"
                      >
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                      <span className="text-slate-500">→</span>
                      <select
                        value={rel.toEntityTypeId}
                        onChange={(e) =>
                          updateRelationshipColumn(index, { toEntityTypeId: e.target.value })
                        }
                        className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-slate-100"
                      >
                        {entityTypes
                          .filter((et) => et.id !== entityTypeId)
                          .map((et) => (
                            <option key={et.id} value={et.id}>
                              {et.name}
                            </option>
                          ))}
                      </select>
                      <input
                        type="text"
                        value={rel.relationshipName}
                        onChange={(e) =>
                          updateRelationshipColumn(index, { relationshipName: e.target.value })
                        }
                        placeholder="e.g. works_at"
                        className="w-24 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setRelationshipColumns((prev) => prev.filter((_, i) => i !== index))
                        }
                        className="text-slate-500 hover:text-red-400"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {validationError && (
            <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
              {validationError}
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(1)}
              className="rounded-2xl border-zinc-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-zinc-800"
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={handleImportWithOntology}
              className="rounded-2xl bg-emerald-500 px-5 py-2 text-xs font-medium text-slate-950 hover:bg-emerald-600"
            >
              Import
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
