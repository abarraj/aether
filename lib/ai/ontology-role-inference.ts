/**
 * Role Inference Engine — runs AFTER AI detection, BEFORE ontology-builder.
 *
 * For transaction-style data (gym sales, POS exports), this engine:
 * 1. Classifies each row's "User" column as staff | client_self_checkout | unknown
 * 2. Rewrites OntologyDetection to produce canonical entity types
 *    (Clients, Staff, Offerings, Branches, SystemActor) instead of raw column-based types
 * 3. Produces a review payload when ambiguity exists (unknown actors, missing totals)
 *
 * AUTHORITATIVE BUSINESS TRUTH:
 * - Client column = always the paying customer (never staff)
 * - User column = actor who processed the sale
 *   - if in STAFF_NAMES → staff/front desk
 *   - if User == Client AND not staff → client self-checkout
 *   - otherwise → unknown (needs review)
 * - Total = authoritative revenue
 * - Description = offering/service/product
 * - Branch = location
 */

import type { OntologyDetection, DetectedEntityType, DetectedRelationship } from '@/lib/ai/ontology-detector';

// ── Types ─────────────────────────────────────────────────────────────

export type ActorRole = 'staff' | 'client_self_checkout' | 'unknown';
export type Channel = 'in_studio' | 'online_checkout' | 'unknown';

export interface RowInference {
  /** Index in original rows array. */
  rowIndex: number;
  payer: string;
  actor: string;
  actorRole: ActorRole;
  channel: Channel;
  confidence: number;
  explanation: string;
}

export interface ReviewQuestion {
  id: string;
  type: 'unknown_actor' | 'missing_total' | 'ambiguous_column';
  question: string;
  suggestion: string;
  confidence: number;
  affectedRows: number;
  resolved: boolean;
  resolution: string | null;
}

export interface InferenceMetadata {
  staffNamesUsed: string[];
  selfCheckoutCount: number;
  staffProcessedCount: number;
  unknownActorCount: number;
  systemActorUsed: boolean;
  revenueReconciliationScore: number;
}

export interface RoleInferenceResult {
  /** Corrected OntologyDetection — same shape, drop-in for ontology-builder. */
  detection: OntologyDetection;
  /** Per-row inference annotations. */
  rowInferences: RowInference[];
  /** Questions for review UI when ambiguity exists. */
  reviewQuestions: ReviewQuestion[];
  /** Summary metadata for mapping_runs. */
  metadata: InferenceMetadata;
  /** Whether the mapping needs human review. */
  needsReview: boolean;
}

// ── Name normalization ────────────────────────────────────────────────

/**
 * Normalize a name for comparison: lowercase, trim, collapse whitespace.
 * Does NOT use entity-synonyms.ts — that's for location/business abbreviations.
 * This is for person name matching against staff rosters.
 */
export function normalizePersonName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,\-'"]/g, '');
}

// ── Column detection heuristics ───────────────────────────────────────

interface ColumnRoles {
  userColumn: string | null;
  clientColumn: string | null;
  descriptionColumn: string | null;
  branchColumn: string | null;
  typeColumn: string | null;
  dateColumn: string | null;
  totalColumn: string | null;
  amountColumn: string | null;
  discountColumn: string | null;
  vatColumn: string | null;
}

const COLUMN_PATTERNS: Record<keyof ColumnRoles, RegExp[]> = {
  userColumn: [/^user$/i, /^processed.?by$/i, /^staff$/i, /^agent$/i, /^cashier$/i, /^sold.?by$/i],
  clientColumn: [/^client$/i, /^customer$/i, /^buyer$/i, /^member$/i, /^payer$/i, /^guest$/i],
  descriptionColumn: [/^description$/i, /^item$/i, /^product$/i, /^service$/i, /^offering$/i, /^package$/i],
  branchColumn: [/^branch$/i, /^location$/i, /^studio$/i, /^site$/i, /^store$/i, /^outlet$/i],
  typeColumn: [/^type$/i, /^transaction.?type$/i, /^category$/i],
  dateColumn: [/^date$/i, /^transaction.?date$/i, /^created$/i, /^timestamp$/i],
  totalColumn: [/^total$/i, /^total.?amount$/i, /^net.?total$/i, /^grand.?total$/i],
  amountColumn: [/^amount$/i, /^subtotal$/i, /^sub.?total$/i, /^base.?amount$/i, /^price$/i],
  discountColumn: [/^discount$/i, /^disc$/i],
  vatColumn: [/^vat$/i, /^tax$/i, /^gst$/i, /^sales.?tax$/i],
};

function detectColumnRoles(headers: string[]): ColumnRoles {
  const roles: ColumnRoles = {
    userColumn: null,
    clientColumn: null,
    descriptionColumn: null,
    branchColumn: null,
    typeColumn: null,
    dateColumn: null,
    totalColumn: null,
    amountColumn: null,
    discountColumn: null,
    vatColumn: null,
  };

  for (const header of headers) {
    const trimmed = header.trim();
    for (const [role, patterns] of Object.entries(COLUMN_PATTERNS) as [keyof ColumnRoles, RegExp[]][]) {
      if (roles[role]) continue; // first match wins
      if (patterns.some((p) => p.test(trimmed))) {
        roles[role] = trimmed;
      }
    }
  }

  return roles;
}

// ── Amount reconciliation ─────────────────────────────────────────────

function toNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const n = Number(String(v).replace(/[,$%]/g, ''));
  return Number.isNaN(n) ? null : n;
}

interface AmountCheck {
  total: number | null;
  amount: number | null;
  discount: number | null;
  vat: number | null;
  inferred: boolean;
  reconciliationScore: number;
}

function reconcileAmount(
  row: Record<string, unknown>,
  roles: ColumnRoles,
): AmountCheck {
  const total = roles.totalColumn ? toNumber(row[roles.totalColumn]) : null;
  const amount = roles.amountColumn ? toNumber(row[roles.amountColumn]) : null;
  const discount = roles.discountColumn ? toNumber(row[roles.discountColumn]) : null;
  const vat = roles.vatColumn ? toNumber(row[roles.vatColumn]) : null;

  if (total !== null && total > 0) {
    // Total exists and is positive — authoritative
    return { total, amount, discount, vat, inferred: false, reconciliationScore: 1.0 };
  }

  // Total missing — try to infer
  if (amount !== null) {
    const candidateTotal = amount - (discount ?? 0) + (vat ?? 0);
    if (candidateTotal > 0) {
      return {
        total: Math.round(candidateTotal * 100) / 100,
        amount,
        discount,
        vat,
        inferred: true,
        reconciliationScore: 0.7,
      };
    }
  }

  // Check if discount == total (POS sale pattern: Total is in Discount column)
  if (discount !== null && discount > 0 && amount === null && total === null) {
    return {
      total: discount,
      amount: null,
      discount: null,
      vat: null,
      inferred: true,
      reconciliationScore: 0.5,
    };
  }

  return { total: null, amount, discount, vat, inferred: false, reconciliationScore: 0 };
}

// ── Core inference ────────────────────────────────────────────────────

/**
 * Detect if this dataset is transactional (has User + Client + Total columns).
 * If not, the inference engine should not run — return null.
 */
export function isTransactionalDataset(headers: string[]): boolean {
  const roles = detectColumnRoles(headers);
  // Must have at least User + Client columns to classify as transactional
  return roles.userColumn !== null && roles.clientColumn !== null;
}

/**
 * Run the role inference engine.
 *
 * @param rows — parsed data rows from upload
 * @param headers — column headers
 * @param staffNames — normalized staff names from payroll + overrides
 * @param existingDetection — OntologyDetection from AI detector
 */
export function runRoleInference(
  rows: Record<string, unknown>[],
  headers: string[],
  staffNames: Set<string>,
  existingDetection: OntologyDetection,
): RoleInferenceResult {
  const roles = detectColumnRoles(headers);

  if (!roles.userColumn || !roles.clientColumn) {
    // Not a transactional dataset — pass through unchanged
    return {
      detection: existingDetection,
      rowInferences: [],
      reviewQuestions: [],
      metadata: {
        staffNamesUsed: [],
        selfCheckoutCount: 0,
        staffProcessedCount: 0,
        unknownActorCount: 0,
        systemActorUsed: false,
        revenueReconciliationScore: 1.0,
      },
      needsReview: false,
    };
  }

  // ── Row-level inference ──────────────────────────────────────────

  const rowInferences: RowInference[] = [];
  const unknownActors = new Map<string, number>(); // normalized name → count
  let selfCheckoutCount = 0;
  let staffProcessedCount = 0;
  let totalReconciliationScore = 0;
  let reconciliationCount = 0;
  let missingTotalCount = 0;
  let systemActorUsed = false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rawUser = String(row[roles.userColumn!] ?? '').trim();
    const rawClient = String(row[roles.clientColumn!] ?? '').trim();
    const normalizedUser = normalizePersonName(rawUser);
    const normalizedClient = normalizePersonName(rawClient);

    let actorRole: ActorRole;
    let channel: Channel;
    let confidence: number;
    let explanation: string;

    if (staffNames.has(normalizedUser)) {
      actorRole = 'staff';
      channel = 'in_studio';
      confidence = 0.95;
      explanation = `"${rawUser}" found in staff roster`;
      staffProcessedCount++;
    } else if (normalizedUser === normalizedClient && normalizedUser !== '') {
      actorRole = 'client_self_checkout';
      channel = 'online_checkout';
      confidence = 0.9;
      explanation = `User == Client ("${rawUser}"), not in staff roster → self-checkout`;
      selfCheckoutCount++;
      systemActorUsed = true;
    } else if (normalizedUser === '') {
      actorRole = 'unknown';
      channel = 'unknown';
      confidence = 0.3;
      explanation = 'User column is empty';
      unknownActors.set('(empty)', (unknownActors.get('(empty)') ?? 0) + 1);
    } else {
      actorRole = 'unknown';
      channel = 'unknown';
      confidence = 0.5;
      explanation = `"${rawUser}" not in staff roster and User ≠ Client`;
      unknownActors.set(normalizedUser, (unknownActors.get(normalizedUser) ?? 0) + 1);
    }

    // Amount check
    const amountCheck = reconcileAmount(row, roles);
    if (amountCheck.total === null) {
      missingTotalCount++;
    }
    if (amountCheck.reconciliationScore > 0) {
      totalReconciliationScore += amountCheck.reconciliationScore;
      reconciliationCount++;
    }

    rowInferences.push({
      rowIndex: i,
      payer: rawClient,
      actor: rawUser,
      actorRole,
      channel,
      confidence,
      explanation,
    });
  }

  const avgReconciliation = reconciliationCount > 0
    ? totalReconciliationScore / reconciliationCount
    : 1.0;

  // ── Build review questions ───────────────────────────────────────

  const reviewQuestions: ReviewQuestion[] = [];

  for (const [name, count] of unknownActors) {
    if (name === '(empty)') continue;
    reviewQuestions.push({
      id: `unknown_actor_${name.replace(/\s+/g, '_')}`,
      type: 'unknown_actor',
      question: `Is "${name}" a staff member missing from payroll, or a system/client actor label?`,
      suggestion: count > 5 ? 'staff' : 'unknown',
      confidence: count > 5 ? 0.7 : 0.4,
      affectedRows: count,
      resolved: false,
      resolution: null,
    });
  }

  if (missingTotalCount > 0) {
    reviewQuestions.push({
      id: 'missing_total',
      type: 'missing_total',
      question: `${missingTotalCount} rows have no Total. We inferred Total from Amount - Discount + VAT where possible. Confirm?`,
      suggestion: 'accept_inferred',
      confidence: avgReconciliation,
      affectedRows: missingTotalCount,
      resolved: false,
      resolution: null,
    });
  }

  // ── Rewrite OntologyDetection ────────────────────────────────────

  const correctedDetection = rewriteDetection(
    existingDetection,
    roles,
    systemActorUsed,
    headers,
  );

  const metadata: InferenceMetadata = {
    staffNamesUsed: Array.from(staffNames),
    selfCheckoutCount,
    staffProcessedCount,
    unknownActorCount: Array.from(unknownActors.values()).reduce((a, b) => a + b, 0),
    systemActorUsed,
    revenueReconciliationScore: Math.round(avgReconciliation * 100) / 100,
  };

  return {
    detection: correctedDetection,
    rowInferences,
    reviewQuestions,
    metadata,
    needsReview: reviewQuestions.length > 0,
  };
}

// ── Detection rewriter ────────────────────────────────────────────────

/**
 * Transform AI-detected entity types into canonical gym ontology.
 * Removes "User" as an entity type. Creates:
 * - Clients (from Client column)
 * - Staff (from User column, filtered by staff roster)
 * - Offerings (from Description column)
 * - Branches (from Branch column)
 * - SystemActor (constant "Online Checkout" node)
 *
 * Relationships:
 * - PURCHASED: Client → Offering
 * - OCCURRED_AT: Offering → Branch
 * - PROCESSED_BY: Offering → Staff | SystemActor
 */
function rewriteDetection(
  original: OntologyDetection,
  roles: ColumnRoles,
  systemActorUsed: boolean,
  headers: string[],
): OntologyDetection {
  const entityTypes: DetectedEntityType[] = [];
  const relationships: DetectedRelationship[] = [];

  // Revenue column for aggregation
  const revenueCol = roles.totalColumn ?? roles.amountColumn;
  const revenueAgg = revenueCol
    ? [{ sourceColumn: revenueCol, key: 'total_revenue', label: 'Total Revenue', type: 'currency' as const, aggregation: 'sum' as const }]
    : [];

  // ── Clients entity type
  if (roles.clientColumn) {
    entityTypes.push({
      name: 'Clients',
      slug: 'client',
      sourceColumn: roles.clientColumn,
      icon: 'user',
      color: '#10B981',
      aggregatedProperties: [
        ...revenueAgg,
        { sourceColumn: roles.totalColumn ?? roles.amountColumn ?? '', key: 'transaction_count', label: 'Transactions', type: 'number' as const, aggregation: 'count' as const },
      ].filter((p) => p.sourceColumn !== ''),
    });
  }

  // ── Staff entity type (sourced from User column, but ONLY staff rows)
  // The ontology-builder will group by User column value — we rely on the
  // inference engine to exclude non-staff Users at the entity level.
  // For now we include the User column as source; actual staff-only
  // filtering is handled by the fact that only staff names get mapped.
  if (roles.userColumn) {
    entityTypes.push({
      name: 'Staff',
      slug: 'staff',
      sourceColumn: roles.userColumn,
      icon: 'briefcase',
      color: '#06B6D4',
      aggregatedProperties: [
        ...revenueAgg.map((p) => ({ ...p, key: 'revenue_processed' as const, label: 'Revenue Processed' as const })),
        { sourceColumn: roles.totalColumn ?? roles.amountColumn ?? '', key: 'transactions_processed', label: 'Transactions Processed', type: 'number' as const, aggregation: 'count' as const },
      ].filter((p) => p.sourceColumn !== ''),
    });
  }

  // ── Offerings entity type
  if (roles.descriptionColumn) {
    entityTypes.push({
      name: 'Offerings',
      slug: 'offering',
      sourceColumn: roles.descriptionColumn,
      icon: 'package',
      color: '#F59E0B',
      aggregatedProperties: [
        ...revenueAgg,
        { sourceColumn: roles.totalColumn ?? roles.amountColumn ?? '', key: 'times_purchased', label: 'Times Purchased', type: 'number' as const, aggregation: 'count' as const },
      ].filter((p) => p.sourceColumn !== ''),
    });
  }

  // ── Branches entity type
  if (roles.branchColumn) {
    entityTypes.push({
      name: 'Branches',
      slug: 'branch',
      sourceColumn: roles.branchColumn,
      icon: 'building2',
      color: '#8B5CF6',
      aggregatedProperties: [
        ...revenueAgg,
        { sourceColumn: roles.totalColumn ?? roles.amountColumn ?? '', key: 'total_transactions', label: 'Total Transactions', type: 'number' as const, aggregation: 'count' as const },
      ].filter((p) => p.sourceColumn !== ''),
    });
  }

  // ── SystemActor entity type (only if self-checkout was detected)
  if (systemActorUsed) {
    entityTypes.push({
      name: 'System Actors',
      slug: 'system_actor',
      sourceColumn: '__system__',
      icon: 'zap',
      color: '#64748B',
      aggregatedProperties: [],
    });
  }

  // ── Relationships

  // Client → Offering (PURCHASED)
  if (roles.clientColumn && roles.descriptionColumn) {
    relationships.push({
      fromTypeSlug: 'client',
      name: 'purchased',
      toTypeSlug: 'offering',
    });
  }

  // Offering → Branch (OCCURRED_AT)
  if (roles.descriptionColumn && roles.branchColumn) {
    relationships.push({
      fromTypeSlug: 'offering',
      name: 'occurred_at',
      toTypeSlug: 'branch',
    });
  }

  // Offering → Staff (PROCESSED_BY) — ontology-builder handles from row co-occurrence
  if (roles.descriptionColumn && roles.userColumn) {
    relationships.push({
      fromTypeSlug: 'offering',
      name: 'processed_by',
      toTypeSlug: 'staff',
    });
  }

  // Carry over metrics from original detection
  const metrics = {
    dateColumn: roles.dateColumn ?? original.metrics.dateColumn,
    revenueColumns: roles.totalColumn
      ? [roles.totalColumn]
      : original.metrics.revenueColumns,
    costColumns: original.metrics.costColumns,
    attendanceColumns: original.metrics.attendanceColumns,
    utilizationColumns: original.metrics.utilizationColumns,
  };

  return {
    entityTypes,
    relationships,
    metrics,
    confidence: original.confidence,
    reasoning: `Role inference engine rewrote detection: ${entityTypes.length} canonical entity types, ${relationships.length} relationships. ${systemActorUsed ? 'SystemActor (Online Checkout) included.' : ''}`,
    streamType: original.streamType ?? 'unknown',
  };
}

// ── Staff-aware row filtering for ontology-builder ────────────────────

/**
 * Filter rows so that the "User" source column only contains staff names.
 * Non-staff Users (self-checkout, unknown) are excluded from the Staff entity type.
 * This is called before passing rows to buildOntologyFromDetection.
 */
export function filterRowsForStaffEntity(
  rows: Record<string, unknown>[],
  rowInferences: RowInference[],
  userColumn: string,
): Record<string, unknown>[] {
  return rows.map((row, i) => {
    const inference = rowInferences[i];
    if (!inference) return row;

    if (inference.actorRole === 'staff') {
      // Staff row — keep User column as-is
      return row;
    }

    // Non-staff row — blank out the User column so ontology-builder
    // doesn't create a Staff entity for this person
    return { ...row, [userColumn]: null };
  });
}

/**
 * Create the SystemActor "Online Checkout" entity for self-checkout rows.
 * This is a synthetic entity that doesn't come from the data — it's
 * a constant node in the ontology graph.
 */
export function buildSystemActorRows(
  rows: Record<string, unknown>[],
  rowInferences: RowInference[],
  userColumn: string,
): Record<string, unknown>[] {
  return rows.map((row, i) => {
    const inference = rowInferences[i];
    if (!inference) return row;

    if (inference.actorRole === 'client_self_checkout') {
      // Replace User with "Online Checkout" so ontology-builder
      // creates a SystemActor entity
      return { ...row, [userColumn]: 'Online Checkout' };
    }

    return row;
  });
}
