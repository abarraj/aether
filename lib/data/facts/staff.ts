// Staff directory fact writer.
// Imports staff names into public.staff_directory from:
//   1. Roster/payroll CSVs  (source = 'roster')
//   2. Transaction data      (source = 'transaction')
//   3. Manual entry          (source = 'manual')
//
// DESIGN: staff_directory is the SINGLE source of truth for "who is staff".
// Leakage v1 only computes gaps for staff in this table with is_active = true.
//
// Roster CSVs require NO revenue and NO date columns — just a name column.
// The canonicalizer extracts names, normalizes them, and upserts.

import { createClient } from '@/lib/supabase/server';
import { normalizePersonName } from '@/lib/ai/ontology-role-inference';

// ── Types ──────────────────────────────────────────────────────

export interface StaffDirectoryEntry {
  org_id: string;
  upload_id: string | null;
  name: string;
  normalized_name: string;
  source: 'roster' | 'transaction' | 'manual' | 'payroll';
  is_active: boolean;
}

// Column patterns that indicate a name column in a roster CSV
const NAME_COLUMN_PATTERNS = [
  /^(full.?)?name$/i,
  /^employee$/i,
  /^staff$/i,
  /^instructor$/i,
  /^worker$/i,
  /^first.?name$/i,
  /^team.?member$/i,
  /^agent$/i,
  /^trainer$/i,
  /^teacher$/i,
];

// ── File type classification ───────────────────────────────────

/**
 * Determine if a CSV/XLSX file is a staff roster (vs. transactional data).
 *
 * A staff roster:
 *  - Has a recognizable name column
 *  - Does NOT have date + revenue columns (or they're sparse)
 *  - Typically has fewer than ~200 rows (staff list, not transactions)
 *
 * Returns true if the file looks like a roster.
 */
export function isStaffRoster(
  headers: string[],
  rows: Record<string, unknown>[],
): boolean {
  const lowerHeaders = headers.map((h) => h.trim().toLowerCase());

  // Must have at least one name-like column
  const hasNameCol = headers.some((h) =>
    NAME_COLUMN_PATTERNS.some((p) => p.test(h.trim())),
  );

  if (!hasNameCol) return false;

  // Check for revenue columns — if present, it's likely transactions
  const revPatterns = ['total', 'amount', 'revenue', 'price', 'gross', 'net', 'sales'];
  const hasRevCol = lowerHeaders.some((h) =>
    revPatterns.some((r) => h.includes(r)),
  );

  // Check for date columns — if present, it's likely transactions
  const datePatterns = ['date', 'time', 'timestamp'];
  const hasDateCol = lowerHeaders.some((h) =>
    datePatterns.some((d) => h.includes(d)),
  );

  // If it has BOTH date + revenue, it's transactional
  if (hasDateCol && hasRevCol) return false;

  // If it has neither, and has a name column, it's a roster
  if (!hasDateCol && !hasRevCol) return true;

  // Edge case: has date but no revenue (e.g., hire date column) — still roster
  // Edge case: has revenue but no date — ambiguous, but lean roster if name col exists
  // Use row count heuristic: rosters tend to be small
  return rows.length < 500;
}

// ── Staff extraction from roster ───────────────────────────────

/**
 * Extract staff names from a roster CSV's parsed rows.
 * Returns normalized names with display names preserved.
 */
export function extractStaffFromRoster(
  headers: string[],
  rows: Record<string, unknown>[],
): { name: string; normalizedName: string }[] {
  // Find the name column
  let nameCol: string | null = null;
  for (const h of headers) {
    if (NAME_COLUMN_PATTERNS.some((p) => p.test(h.trim()))) {
      nameCol = h;
      break;
    }
  }

  if (!nameCol) {
    // Fallback: find the first text-heavy column
    for (const h of headers) {
      const values = rows.slice(0, 20).map((r) => r[h]);
      const textValues = values.filter(
        (v) =>
          typeof v === 'string' &&
          v.trim().length > 0 &&
          /^[a-zA-Z\s\-'.]+$/.test(v.trim()),
      );
      if (textValues.length > values.length * 0.6) {
        nameCol = h;
        break;
      }
    }
  }

  if (!nameCol) return [];

  const seen = new Set<string>();
  const result: { name: string; normalizedName: string }[] = [];

  for (const row of rows) {
    const val = row[nameCol];
    if (typeof val !== 'string' || val.trim() === '') continue;

    const displayName = val.trim();
    const normalized = normalizePersonName(displayName);

    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    result.push({ name: displayName, normalizedName: normalized });
  }

  return result;
}

// ── Staff extraction from transactions ─────────────────────────

/**
 * Extract unique staff names from transaction fact data.
 * Used to populate staff_directory from transaction uploads when
 * the staff_name field is populated.
 *
 * Only extracts names that appear to be real staff (not clients doing
 * self-checkout). Skips rows where staff_name == client_name (online channel).
 */
export function extractStaffFromTransactions(
  rows: { data: Record<string, unknown> }[],
  staffNameHeader: string | null,
  clientNameHeader: string | null,
): { name: string; normalizedName: string }[] {
  if (!staffNameHeader) return [];

  const seen = new Set<string>();
  const result: { name: string; normalizedName: string }[] = [];

  for (const row of rows) {
    const staffVal = row.data[staffNameHeader];
    if (typeof staffVal !== 'string' || staffVal.trim() === '') continue;

    const displayName = staffVal.trim();
    const normalized = normalizePersonName(displayName);

    // Skip if this looks like a client self-checkout (User == Client)
    if (clientNameHeader) {
      const clientVal = row.data[clientNameHeader];
      if (typeof clientVal === 'string') {
        const clientNorm = normalizePersonName(clientVal.trim());
        if (clientNorm === normalized) continue; // online self-checkout
      }
    }

    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    result.push({ name: displayName, normalizedName: normalized });
  }

  return result;
}

// ── Database operations ────────────────────────────────────────

/**
 * Upsert staff names into public.staff_directory.
 * Uses (org_id, normalized_name) as the conflict key.
 * Does NOT overwrite is_active or source if the row already exists
 * with a higher-priority source.
 */
export async function writeStaffDirectory(
  orgId: string,
  uploadId: string | null,
  entries: { name: string; normalizedName: string }[],
  source: 'roster' | 'transaction' | 'manual' | 'payroll',
): Promise<number> {
  if (entries.length === 0) return 0;

  const supabase = await createClient();

  const rows = entries.map((e) => ({
    org_id: orgId,
    upload_id: uploadId,
    name: e.name,
    normalized_name: e.normalizedName,
    source,
    is_active: true,
  }));

  // Batch upsert (500 at a time)
  let written = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supabase
      .from('staff_directory')
      .upsert(batch, {
        onConflict: 'org_id,normalized_name',
        ignoreDuplicates: true, // don't overwrite existing rows
      });

    if (error) {
      console.error(
        `[facts/staff] Upsert batch ${i / 500 + 1} failed:`,
        error.message,
      );
    } else {
      written += batch.length;
    }
  }

  console.log(
    `[facts/staff] Wrote ${written} staff entries (source=${source}) for org ${orgId}`,
  );

  return written;
}

/**
 * Load active staff names from staff_directory for a given org.
 * Returns a Set of normalized names for fast lookup.
 */
export async function loadActiveStaff(
  orgId: string,
): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('staff_directory')
    .select('normalized_name')
    .eq('org_id', orgId)
    .eq('is_active', true);

  const names = new Set<string>();
  for (const row of (data ?? []) as { normalized_name: string }[]) {
    if (row.normalized_name) names.add(row.normalized_name);
  }
  return names;
}

/**
 * Delete roster-sourced staff entries for a given upload.
 * Called during upload deletion cascade.
 * Does NOT delete transaction-sourced or manual entries.
 */
export async function deleteRosterStaff(
  orgId: string,
  uploadId: string,
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('staff_directory')
    .delete()
    .eq('org_id', orgId)
    .eq('upload_id', uploadId)
    .eq('source', 'roster');
}
