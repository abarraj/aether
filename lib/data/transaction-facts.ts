// Canonical Transaction Fact builder ("gold transform").
// Input:  raw data_rows + AI detection metrics
// Output: normalized TransactionFact array with deterministic parsing.
//
// This is the SINGLE source of truth for monetary values, parsed dates,
// and actor classification. KPI snapshots and performance gaps must
// consume TransactionFacts, never raw rows directly.

import type { DetectedMetrics } from '@/lib/ai/ontology-detector';

// ── Public Types ────────────────────────────────────────────────

export interface TransactionFact {
  /** Parsed transaction date (UTC midnight). */
  transactedAt: Date;
  /** ISO date string YYYY-MM-DD for bucketing. */
  dateKey: string;
  /** Final amount paid — from "Total" column (preferred) or detection revenueColumns. */
  amountTotal: number;
  /** Discount component (optional). */
  amountDiscount: number | null;
  /** Tax / VAT component (optional). */
  amountTax: number | null;
  /** Transaction type inferred from a Type column. */
  type: 'invoice' | 'refund' | 'adjustment';
  /** Raw User column value — the actor who processed the sale. */
  actorUserName: string | null;
  /** Raw Client column value — the paying customer. */
  clientName: string | null;
  /** Description / offering name. */
  offeringName: string | null;
  /** Branch or location. */
  branchName: string | null;
  /** External transaction ID if present. */
  transactionId: string | null;
  /** Inferred channel. */
  channel: 'online_self_checkout' | 'in_studio_or_staff';
}

export interface FactBuildResult {
  facts: TransactionFact[];
  /** Date format that was detected for this upload. */
  dateFormat: 'dd/MM/yyyy' | 'MM/dd/yyyy' | 'iso' | 'mixed' | 'unknown';
  /** Number of rows that failed date parsing. */
  dateParseFailures: number;
  /** Number of rows that had no usable revenue value. */
  revenueParseFailures: number;
  /** The resolved revenue column header. */
  resolvedRevenueColumn: string | null;
  /** The resolved date column header. */
  resolvedDateColumn: string | null;
  /** Min and max parsed dates. */
  dateRange: { min: string; max: string } | null;
}

// ── Robust Date Parsing ─────────────────────────────────────────

const DD_MM_YYYY_RE = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;

/**
 * Parse a date string robustly:
 * 1. ISO (YYYY-MM-DD or full ISO)
 * 2. DD/MM/YYYY or DD-MM-YYYY (with optional HH:mm:ss)
 * 3. MM/DD/YYYY fallback when ambiguous
 * 4. Fallback to Date constructor
 *
 * dayFirst hint: if true, prefer day-first when ambiguous.
 */
export function parseDate(raw: unknown, dayFirst = true): Date | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // 1. ISO format: 2026-02-28 or 2026-02-28T18:02:58Z
  if (ISO_DATE_RE.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
  }

  // 2. Slash / dot / dash delimited: could be DD/MM/YYYY or MM/DD/YYYY
  const m = DD_MM_YYYY_RE.exec(s);
  if (m) {
    const a = parseInt(m[1], 10); // first number
    const b = parseInt(m[2], 10); // second number
    const year = parseInt(m[3], 10);
    const hours = m[4] ? parseInt(m[4], 10) : 0;
    const minutes = m[5] ? parseInt(m[5], 10) : 0;
    const seconds = m[6] ? parseInt(m[6], 10) : 0;

    // Decide day vs month
    let day: number;
    let month: number;

    if (a > 12) {
      // First number > 12 → must be day
      day = a;
      month = b;
    } else if (b > 12) {
      // Second number > 12 → must be day (US format)
      month = a;
      day = b;
    } else {
      // Both ≤ 12: ambiguous, use dayFirst hint
      if (dayFirst) {
        day = a;
        month = b;
      } else {
        month = a;
        day = b;
      }
    }

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      const d = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
      // Validate: Date constructor may silently overflow (e.g., Feb 30 → Mar 2)
      if (d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day) {
        return d;
      }
    }
  }

  // 3. Last resort: native Date constructor (handles US-style "March 5, 2026" etc.)
  const fallback = new Date(s);
  if (!Number.isNaN(fallback.getTime())) return fallback;

  return null;
}

/**
 * Detect the dominant date format for a set of raw date values.
 * Scans up to 50 samples and checks if day-first or month-first is more likely.
 */
export function detectDateFormat(values: unknown[]): 'dd/MM/yyyy' | 'MM/dd/yyyy' | 'iso' | 'mixed' | 'unknown' {
  let isoCount = 0;
  let dayFirstOnly = 0; // cases where first number > 12 (must be day-first)
  let monthFirstOnly = 0; // cases where second number > 12 (must be month-first)
  let ambiguous = 0;
  let total = 0;

  for (const v of values.slice(0, 50)) {
    if (v == null) continue;
    const s = String(v).trim();
    if (!s) continue;
    total++;

    if (ISO_DATE_RE.test(s)) {
      isoCount++;
      continue;
    }

    const m = DD_MM_YYYY_RE.exec(s);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      if (a > 12) dayFirstOnly++;
      else if (b > 12) monthFirstOnly++;
      else ambiguous++;
    }
  }

  if (total === 0) return 'unknown';
  if (isoCount === total) return 'iso';
  if (dayFirstOnly > 0 && monthFirstOnly === 0) return 'dd/MM/yyyy';
  if (monthFirstOnly > 0 && dayFirstOnly === 0) return 'MM/dd/yyyy';
  if (dayFirstOnly > 0 && monthFirstOnly > 0) return 'mixed';
  // All ambiguous — default to day-first (European / most of the world)
  return 'dd/MM/yyyy';
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Robust Numeric Parsing ──────────────────────────────────────

export function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    let cleaned = value.trim();
    if (!cleaned) return null;
    // Parenthetical negatives: (500) => -500
    const parenMatch = /^\(([0-9.,\s]+)\)$/.exec(cleaned);
    if (parenMatch) {
      cleaned = `-${parenMatch[1]}`;
    }
    // Strip currency symbols, commas, whitespace
    cleaned = cleaned.replace(/[$€£,\s]/g, '');
    // Strip trailing percent sign
    cleaned = cleaned.replace(/%$/, '');
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ── Column Resolution ───────────────────────────────────────────

function normKey(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, ' ');
}

function resolveHeader(detected: string, actualHeaders: string[]): string | null {
  if (!detected) return null;
  const dNorm = normKey(detected).replace(/_/g, ' ');
  for (const h of actualHeaders) {
    if (normKey(h) === dNorm) return h;
  }
  for (const h of actualHeaders) {
    if (normKey(h).replace(/_/g, ' ') === dNorm) return h;
  }
  for (const h of actualHeaders) {
    const hNorm = normKey(h).replace(/_/g, ' ');
    if (hNorm.includes(dNorm) || dNorm.includes(hNorm)) return h;
  }
  return null;
}

function getVal(record: Record<string, unknown>, header: string | null): unknown {
  if (!header) return null;
  const target = normKey(header);
  for (const k of Object.keys(record)) {
    if (normKey(k) === target) return record[k];
  }
  return null;
}

// ── Transaction Type Inference ──────────────────────────────────

const REFUND_PATTERNS = /refund|return|credit note|reversal|cancelled/i;
const ADJUSTMENT_PATTERNS = /adjust|correction|write.?off|void/i;

function inferType(typeValue: unknown): TransactionFact['type'] {
  if (typeValue == null) return 'invoice';
  const s = String(typeValue).trim();
  if (REFUND_PATTERNS.test(s)) return 'refund';
  if (ADJUSTMENT_PATTERNS.test(s)) return 'adjustment';
  return 'invoice';
}

// ── Channel Inference ───────────────────────────────────────────

function normalizeActorName(name: string | null): string {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function inferChannel(user: string | null, client: string | null): TransactionFact['channel'] {
  if (!user || !client) return 'in_studio_or_staff';
  return normalizeActorName(user) === normalizeActorName(client)
    ? 'online_self_checkout'
    : 'in_studio_or_staff';
}

// ── Revenue Column Priority ─────────────────────────────────────

/**
 * "Total" = final amount paid. This is the authoritative revenue column.
 * Only fall back to other columns if Total is missing.
 */
const TOTAL_CANDIDATES = ['total', 'total paid', 'amount paid', 'final amount', 'net total'];
const REVENUE_FALLBACK = ['amount', 'revenue', 'net', 'gross', 'sales', 'price', 'income'];
const DISCOUNT_CANDIDATES = ['discount', 'disc', 'discount amount'];
const TAX_CANDIDATES = ['vat', 'tax', 'gst', 'sales tax', 'tax amount'];
const TYPE_CANDIDATES = ['type', 'transaction type', 'payment type', 'status'];
const USER_CANDIDATES = ['user', 'staff', 'instructor', 'employee', 'seller', 'agent', 'processed by', 'sold by'];
const CLIENT_CANDIDATES = ['client', 'customer', 'buyer', 'member', 'patient', 'guest'];
const DESCRIPTION_CANDIDATES = ['description', 'item', 'product', 'service', 'offering', 'class', 'class type', 'name'];
const BRANCH_CANDIDATES = ['branch', 'location', 'store', 'site', 'office', 'studio'];
const TXID_CANDIDATES = ['transaction id', 'txn id', 'order id', 'invoice id', 'reference', 'ref', 'id'];

function findBestColumn(headers: string[], candidates: string[]): string | null {
  const lower = headers.map((h) => normKey(h));
  for (const c of candidates) {
    const idx = lower.indexOf(c);
    if (idx !== -1) return headers[idx];
  }
  // Partial match
  for (const c of candidates) {
    const idx = lower.findIndex((h) => h.includes(c) || c.includes(h));
    if (idx !== -1) return headers[idx];
  }
  return null;
}

// ── Date Column Priority ────────────────────────────────────────

const DATE_CANDIDATES = ['date', 'transaction date', 'sale date', 'order date', 'time', 'timestamp', 'created at'];

// ── Main Builder ────────────────────────────────────────────────

export function buildTransactionFacts(
  rows: { date: string | null; data: Record<string, unknown> }[],
  detectedMetrics: DetectedMetrics | null,
  _columnMapping?: Record<string, string> | null,
): FactBuildResult {
  if (rows.length === 0) {
    return {
      facts: [],
      dateFormat: 'unknown',
      dateParseFailures: 0,
      revenueParseFailures: 0,
      resolvedRevenueColumn: null,
      resolvedDateColumn: null,
      dateRange: null,
    };
  }

  const sampleRecord = rows[0].data as Record<string, unknown>;
  const headers = Object.keys(sampleRecord);

  // ── Resolve revenue column ────────────────────────────────────
  // Priority: "Total" > AI detection > hardcoded fallback
  let revenueCol = findBestColumn(headers, TOTAL_CANDIDATES);

  if (!revenueCol && detectedMetrics) {
    for (const col of detectedMetrics.revenueColumns) {
      const resolved = resolveHeader(col, headers);
      if (resolved) { revenueCol = resolved; break; }
    }
  }

  if (!revenueCol) {
    revenueCol = findBestColumn(headers, REVENUE_FALLBACK);
  }

  // ── Resolve date column ───────────────────────────────────────
  let dateCol: string | null = null;
  if (detectedMetrics?.dateColumn) {
    dateCol = resolveHeader(detectedMetrics.dateColumn, headers);
  }
  if (!dateCol) {
    dateCol = findBestColumn(headers, DATE_CANDIDATES);
  }

  // ── Resolve other columns ─────────────────────────────────────
  const discountCol = findBestColumn(headers, DISCOUNT_CANDIDATES);
  const taxCol = findBestColumn(headers, TAX_CANDIDATES);
  const typeCol = findBestColumn(headers, TYPE_CANDIDATES);
  const userCol = findBestColumn(headers, USER_CANDIDATES);
  const clientCol = findBestColumn(headers, CLIENT_CANDIDATES);
  const descCol = findBestColumn(headers, DESCRIPTION_CANDIDATES);
  const branchCol = findBestColumn(headers, BRANCH_CANDIDATES);
  const txIdCol = findBestColumn(headers, TXID_CANDIDATES);

  // ── Detect date format from samples ───────────────────────────
  const dateSamples: unknown[] = [];
  for (const row of rows.slice(0, 50)) {
    const record = row.data as Record<string, unknown>;
    const rawDate = row.date ?? getVal(record, dateCol);
    if (rawDate != null) dateSamples.push(rawDate);
  }
  const dateFormat = detectDateFormat(dateSamples);
  const dayFirst = dateFormat !== 'MM/dd/yyyy';

  if (process.env.NODE_ENV !== 'production') {
    console.log('[transaction-facts] Column resolution:', {
      revenueCol,
      dateCol,
      dateFormat,
      userCol,
      clientCol,
      branchCol,
      descCol,
      headers: headers.slice(0, 12),
    });
  }

  // ── Build facts ───────────────────────────────────────────────
  const facts: TransactionFact[] = [];
  let dateParseFailures = 0;
  let revenueParseFailures = 0;
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const row of rows) {
    const record = row.data as Record<string, unknown>;

    // Date: prefer row.date (pre-parsed), then detected column, then fallback
    const rawDate = row.date ?? getVal(record, dateCol) ?? findFallbackDate(record);
    const parsed = parseDate(rawDate, dayFirst);
    if (!parsed) {
      dateParseFailures++;
      continue;
    }
    const dateKey = toDateKey(parsed);

    // Revenue
    const rawTotal = getVal(record, revenueCol);
    const amountTotal = parseNumeric(rawTotal);
    if (amountTotal === null) {
      revenueParseFailures++;
      continue;
    }

    // Transaction type
    const rawType = getVal(record, typeCol);
    const txType = inferType(rawType);

    // For refunds, ensure the amount is negative for aggregation
    const signedTotal = txType === 'refund' ? -Math.abs(amountTotal) : amountTotal;

    // Other fields
    const user = getVal(record, userCol);
    const client = getVal(record, clientCol);
    const userName = user != null ? String(user).trim() || null : null;
    const clientN = client != null ? String(client).trim() || null : null;

    const desc = getVal(record, descCol);
    const branch = getVal(record, branchCol);
    const txId = getVal(record, txIdCol);

    facts.push({
      transactedAt: parsed,
      dateKey,
      amountTotal: signedTotal,
      amountDiscount: parseNumeric(getVal(record, discountCol)),
      amountTax: parseNumeric(getVal(record, taxCol)),
      type: txType,
      actorUserName: userName,
      clientName: clientN,
      offeringName: desc != null ? String(desc).trim() || null : null,
      branchName: branch != null ? String(branch).trim() || null : null,
      transactionId: txId != null ? String(txId).trim() || null : null,
      channel: inferChannel(userName, clientN),
    });

    // Track date range
    if (!minDate || dateKey < minDate) minDate = dateKey;
    if (!maxDate || dateKey > maxDate) maxDate = dateKey;
  }

  return {
    facts,
    dateFormat,
    dateParseFailures,
    revenueParseFailures,
    resolvedRevenueColumn: revenueCol,
    resolvedDateColumn: dateCol,
    dateRange: minDate && maxDate ? { min: minDate, max: maxDate } : null,
  };
}

// ── Date fallback for rows with no explicit date column ─────────

const DATE_FALLBACK_KEYS = [
  'date', 'time', 'timestamp', 'created_at', 'created at',
  'transaction date', 'sale date', 'order date',
  'week_start', 'week start', 'period_start', 'period start',
];

function findFallbackDate(record: Record<string, unknown>): unknown {
  const lower = Object.keys(record).map((k) => ({ orig: k, norm: normKey(k) }));
  for (const want of DATE_FALLBACK_KEYS) {
    const m = lower.find((k) => k.norm === want);
    if (m) return record[m.orig];
  }
  // Loose containment
  const loose = lower.find((k) =>
    k.norm.includes('date') || k.norm.includes('time'),
  );
  return loose ? record[loose.orig] : null;
}
