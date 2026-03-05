/**
 * Staff roster utilities: parse payroll files and load staff names
 * from the staff_roster_overrides table.
 *
 * Used by the role inference engine to classify User column values
 * as staff vs client self-checkout.
 */

import * as XLSX from 'xlsx';
import { normalizePersonName } from '@/lib/ai/ontology-role-inference';

// ── Payroll parsing ───────────────────────────────────────────────────

/** Column patterns that likely contain staff names in payroll data. */
const NAME_COLUMN_PATTERNS = [
  /^(full.?)?name$/i,
  /^employee$/i,
  /^staff$/i,
  /^instructor$/i,
  /^worker$/i,
  /^first.?name$/i,
  /^team.?member$/i,
];

/**
 * Extract staff names from an XLSX payroll file.
 * Scans all sheets for columns matching NAME_COLUMN_PATTERNS,
 * returns a Set of normalized names.
 */
export function parsePayrollXlsx(buffer: Buffer): Set<string> {
  const names = new Set<string>();
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: false,
    });

    if (rows.length === 0) continue;

    const headers = Object.keys(rows[0]!);
    const nameColumns = headers.filter((h) =>
      NAME_COLUMN_PATTERNS.some((p) => p.test(h.trim())),
    );

    // If no pattern match, try first text column with name-like values
    if (nameColumns.length === 0) {
      for (const h of headers) {
        const values = rows.slice(0, 20).map((r) => r[h]);
        const textValues = values.filter(
          (v) => typeof v === 'string' && v.trim().length > 0 && /^[a-zA-Z\s\-'.]+$/.test(v.trim()),
        );
        if (textValues.length > values.length * 0.6) {
          nameColumns.push(h);
          break; // use only the first likely name column
        }
      }
    }

    for (const col of nameColumns) {
      for (const row of rows) {
        const val = row[col];
        if (typeof val !== 'string' || val.trim() === '') continue;
        names.add(normalizePersonName(val));
      }
    }
  }

  return names;
}

/**
 * Extract staff names from a CSV payroll file.
 * Same logic as XLSX but for CSV-formatted payroll data.
 */
export function parsePayrollCsv(
  rows: Record<string, unknown>[],
  headers: string[],
): Set<string> {
  const names = new Set<string>();

  const nameColumns = headers.filter((h) =>
    NAME_COLUMN_PATTERNS.some((p) => p.test(h.trim())),
  );

  if (nameColumns.length === 0) {
    for (const h of headers) {
      const values = rows.slice(0, 20).map((r) => r[h]);
      const textValues = values.filter(
        (v) => typeof v === 'string' && v.trim().length > 0 && /^[a-zA-Z\s\-'.]+$/.test(v.trim()),
      );
      if (textValues.length > values.length * 0.6) {
        nameColumns.push(h);
        break;
      }
    }
  }

  for (const col of nameColumns) {
    for (const row of rows) {
      const val = row[col];
      if (typeof val !== 'string' || val.trim() === '') continue;
      names.add(normalizePersonName(val));
    }
  }

  return names;
}

// ── Database loading ──────────────────────────────────────────────────

/**
 * Load normalized staff names from the staff_roster_overrides table.
 * Returns a Set of normalized names for fast lookup during inference.
 */
export async function loadStaffRosterFromDb(
  orgId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<Set<string>> {
  const { data } = await supabase
    .from('staff_roster_overrides')
    .select('normalized_name')
    .eq('org_id', orgId) as { data: { normalized_name: string }[] | null };

  const names = new Set<string>();
  for (const row of data ?? []) {
    if (row.normalized_name) {
      names.add(row.normalized_name);
    }
  }
  return names;
}

/**
 * Save staff names to staff_roster_overrides.
 * Uses upsert with ON CONFLICT on (org_id, normalized_name).
 */
export async function saveStaffRosterToDb(
  orgId: string,
  names: Set<string>,
  source: 'payroll_import' | 'manual' | 'review_confirm',
  uploadId: string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<void> {
  if (names.size === 0) return;

  const rows = Array.from(names).map((normalizedName) => ({
    org_id: orgId,
    name: normalizedName, // For display; normalized is canonical
    normalized_name: normalizedName,
    source,
    source_upload_id: uploadId,
  }));

  await supabase
    .from('staff_roster_overrides')
    .upsert(rows, {
      onConflict: 'org_id,normalized_name',
      ignoreDuplicates: true,
    });
}
