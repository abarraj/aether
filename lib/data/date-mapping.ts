// Shared date extraction helpers for upload route and backfill.

import { parseDate } from '@/lib/data/transaction-facts';

export function normKey(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Robust date normalizer. Handles ISO, DD/MM/YYYY, MM/DD/YYYY, and datetime strings.
 * Prefers day-first (DD/MM) when ambiguous, since our primary data uses that format.
 */
export function normalizeDate(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const d = parseDate(raw, /* dayFirst */ true);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

export function getMappedValue(
  row: Record<string, unknown>,
  header: string | null,
): unknown {
  if (!header) return null;
  const target = normKey(header);
  for (const k of Object.keys(row)) {
    if (normKey(k) === target) return row[k];
  }
  return null;
}

export function findFallbackDateValue(row: Record<string, unknown>): unknown {
  const keys = Object.keys(row);
  const priorityOrder = [
    (nk: string) => nk.includes('week_start'),
    (nk: string) => nk.includes('period_start'),
    (nk: string) => nk.includes('start_date'),
    (nk: string) => nk.includes('date'),
    (nk: string) => nk.includes('time'),
    (nk: string) => nk.includes('timestamp'),
    (nk: string) => nk.includes('week'),
  ];
  for (const pred of priorityOrder) {
    const candidate = keys.find((k) => pred(normKey(k)));
    if (candidate) return row[candidate];
  }
  return null;
}

export function extractDateFromRow(
  row: Record<string, unknown>,
  dateHeader: string | null,
): string | null {
  const raw = getMappedValue(row, dateHeader) ?? findFallbackDateValue(row);
  return normalizeDate(raw);
}
