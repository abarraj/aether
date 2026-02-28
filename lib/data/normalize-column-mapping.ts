export type ColumnMapping = Record<string, string>;

const KNOWN_ROLES = new Set([
  'date',
  'revenue',
  'expected',
  'dimension',
  'cost',
  'labor_hours',
  'attendance',
]);

export function normalizeColumnMapping(raw: unknown): ColumnMapping {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;

  // If values look like roles => header->role already
  const values = Object.values(obj).filter((v) => typeof v === 'string') as string[];
  const looksHeaderToRole = values.some((v) => KNOWN_ROLES.has(v));

  if (looksHeaderToRole) {
    const out: ColumnMapping = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  }

  // Otherwise assume role->header and invert
  const out: ColumnMapping = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof k === 'string' && typeof v === 'string' && KNOWN_ROLES.has(k)) {
      out[v] = k; // header -> role
    }
  }
  return out;
}
