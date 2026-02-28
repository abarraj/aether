// Shared date extraction helpers for upload route and backfill.

export function normKey(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeDate(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const d = new Date(String(raw));
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return null;
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
