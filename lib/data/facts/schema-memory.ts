// Schema memory writer.
// Tracks column → canonical_field mappings per org.
// Learns from each upload so future imports can auto-map columns.
//
// TABLE SCHEMA (actual columns):
//   id, org_id, source_kind, source_column, canonical_field,
//   confidence, last_seen_at, created_at
//
// Unique key: (org_id, source_column)
// Upsert: updates confidence when the same column is seen again.
//
// DESIGN: schema_memory is NEVER deleted on upload removal.
// It accumulates institutional knowledge across uploads.

import { createClient } from '@/lib/supabase/server';

// ── Types ──────────────────────────────────────────────────────

export interface SchemaMapping {
  sourceColumn: string;
  canonicalField: string;
  confidence: number;
}

// Canonical field names that the system recognizes
export const CANONICAL_FIELDS = [
  'date',
  'revenue',
  'discount',
  'tax',
  'total',
  'type',
  'staff_name',
  'client_name',
  'offering',
  'branch',
  'transaction_id',
  'name',           // for roster files
  'email',
  'phone',
  'role',
] as const;

export type CanonicalField = typeof CANONICAL_FIELDS[number];

// ── Column → Canonical Field inference ─────────────────────────

// Known mappings: header pattern → canonical field
const COLUMN_MAPPINGS: { pattern: RegExp; field: CanonicalField }[] = [
  // Date
  { pattern: /^date$/i, field: 'date' },
  { pattern: /^transaction.?date$/i, field: 'date' },
  { pattern: /^sale.?date$/i, field: 'date' },
  { pattern: /^order.?date$/i, field: 'date' },
  { pattern: /^time$/i, field: 'date' },
  { pattern: /^timestamp$/i, field: 'date' },
  { pattern: /^created.?at$/i, field: 'date' },

  // Revenue
  { pattern: /^total$/i, field: 'total' },
  { pattern: /^total.?paid$/i, field: 'total' },
  { pattern: /^amount.?paid$/i, field: 'total' },
  { pattern: /^final.?amount$/i, field: 'total' },
  { pattern: /^net.?total$/i, field: 'total' },
  { pattern: /^amount$/i, field: 'revenue' },
  { pattern: /^revenue$/i, field: 'revenue' },
  { pattern: /^gross$/i, field: 'revenue' },
  { pattern: /^net$/i, field: 'revenue' },
  { pattern: /^sales$/i, field: 'revenue' },
  { pattern: /^price$/i, field: 'revenue' },
  { pattern: /^income$/i, field: 'revenue' },

  // Discount / Tax
  { pattern: /^discount$/i, field: 'discount' },
  { pattern: /^disc$/i, field: 'discount' },
  { pattern: /^vat$/i, field: 'tax' },
  { pattern: /^tax$/i, field: 'tax' },
  { pattern: /^gst$/i, field: 'tax' },
  { pattern: /^sales.?tax$/i, field: 'tax' },

  // Type
  { pattern: /^type$/i, field: 'type' },
  { pattern: /^transaction.?type$/i, field: 'type' },
  { pattern: /^payment.?type$/i, field: 'type' },
  { pattern: /^status$/i, field: 'type' },

  // Staff / User
  { pattern: /^user$/i, field: 'staff_name' },
  { pattern: /^staff$/i, field: 'staff_name' },
  { pattern: /^instructor$/i, field: 'staff_name' },
  { pattern: /^employee$/i, field: 'staff_name' },
  { pattern: /^seller$/i, field: 'staff_name' },
  { pattern: /^agent$/i, field: 'staff_name' },
  { pattern: /^processed.?by$/i, field: 'staff_name' },
  { pattern: /^sold.?by$/i, field: 'staff_name' },
  { pattern: /^trainer$/i, field: 'staff_name' },
  { pattern: /^teacher$/i, field: 'staff_name' },

  // Client
  { pattern: /^client$/i, field: 'client_name' },
  { pattern: /^customer$/i, field: 'client_name' },
  { pattern: /^buyer$/i, field: 'client_name' },
  { pattern: /^member$/i, field: 'client_name' },
  { pattern: /^patient$/i, field: 'client_name' },
  { pattern: /^guest$/i, field: 'client_name' },

  // Offering
  { pattern: /^description$/i, field: 'offering' },
  { pattern: /^item$/i, field: 'offering' },
  { pattern: /^product$/i, field: 'offering' },
  { pattern: /^service$/i, field: 'offering' },
  { pattern: /^offering$/i, field: 'offering' },
  { pattern: /^class$/i, field: 'offering' },
  { pattern: /^class.?type$/i, field: 'offering' },

  // Branch
  { pattern: /^branch$/i, field: 'branch' },
  { pattern: /^location$/i, field: 'branch' },
  { pattern: /^store$/i, field: 'branch' },
  { pattern: /^site$/i, field: 'branch' },
  { pattern: /^studio$/i, field: 'branch' },

  // Transaction ID
  { pattern: /^transaction.?id$/i, field: 'transaction_id' },
  { pattern: /^txn.?id$/i, field: 'transaction_id' },
  { pattern: /^order.?id$/i, field: 'transaction_id' },
  { pattern: /^invoice.?id$/i, field: 'transaction_id' },
  { pattern: /^reference$/i, field: 'transaction_id' },
  { pattern: /^ref$/i, field: 'transaction_id' },

  // Roster fields
  { pattern: /^(full.?)?name$/i, field: 'name' },
  { pattern: /^email$/i, field: 'email' },
  { pattern: /^phone$/i, field: 'phone' },
  { pattern: /^role$/i, field: 'role' },
];

/**
 * Infer canonical field mappings from column headers.
 * Returns SchemaMapping[] with confidence scores.
 */
export function inferColumnMappings(
  headers: string[],
  _sampleRows?: Record<string, unknown>[],
): SchemaMapping[] {
  const mappings: SchemaMapping[] = [];

  for (const header of headers) {
    const trimmed = header.trim();
    if (!trimmed) continue;

    // Try exact pattern match
    let matched = false;
    for (const { pattern, field } of COLUMN_MAPPINGS) {
      if (pattern.test(trimmed)) {
        mappings.push({
          sourceColumn: header,
          canonicalField: field,
          confidence: 0.9, // High confidence for exact match
        });
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Try fuzzy / partial match
      const lowerHeader = trimmed.toLowerCase().replace(/[_\-\s]+/g, '');
      for (const { pattern, field } of COLUMN_MAPPINGS) {
        const patternSource = pattern.source.replace(/[\\^$]/g, '').toLowerCase().replace(/[_\-\s.?]+/g, '');
        if (lowerHeader.includes(patternSource) || patternSource.includes(lowerHeader)) {
          mappings.push({
            sourceColumn: header,
            canonicalField: field,
            confidence: 0.6, // Lower confidence for fuzzy match
          });
          matched = true;
          break;
        }
      }
    }
  }

  return mappings;
}

// ── Database operations ────────────────────────────────────────

/**
 * Upsert schema mappings into public.schema_memory.
 * Unique on (org_id, source_column).
 * Updates confidence and last_seen_at on conflict.
 *
 * Table columns: org_id, source_kind, source_column, canonical_field,
 *                confidence, last_seen_at, created_at
 * (no upload_id, no sample_values)
 */
export async function writeSchemaMemory(
  orgId: string,
  _uploadId: string | null,
  mappings: SchemaMapping[],
): Promise<number> {
  if (mappings.length === 0) return 0;

  const supabase = await createClient();

  const rows = mappings.map((m) => ({
    org_id: orgId,
    source_kind: 'csv_upload',
    source_column: m.sourceColumn,
    canonical_field: m.canonicalField,
    confidence: Math.round(m.confidence * 100) / 100,
    last_seen_at: new Date().toISOString(),
  }));

  // Upsert with conflict on (org_id, source_column)
  let written = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supabase
      .from('schema_memory')
      .upsert(batch, {
        onConflict: 'org_id,source_column',
      });

    if (error) {
      console.error(
        `[facts/schema-memory] Upsert batch ${i / 500 + 1} failed:`,
        error.message,
      );
    } else {
      written += batch.length;
    }
  }

  console.log(
    `[facts/schema-memory] Wrote ${written} schema mappings for org ${orgId}`,
  );

  return written;
}

/**
 * Load existing schema memory for an org.
 * Returns mappings keyed by source_column for fast lookup.
 */
export async function loadSchemaMemory(
  orgId: string,
): Promise<Map<string, { canonicalField: string; confidence: number }>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('schema_memory')
    .select('source_column, canonical_field, confidence')
    .eq('org_id', orgId);

  const map = new Map<string, { canonicalField: string; confidence: number }>();
  for (const row of (data ?? []) as { source_column: string; canonical_field: string; confidence: number }[]) {
    map.set(row.source_column, {
      canonicalField: row.canonical_field,
      confidence: row.confidence,
    });
  }
  return map;
}
