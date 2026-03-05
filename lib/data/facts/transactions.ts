// Transaction fact writer.
// Transforms in-memory TransactionFact[] → persisted rows in public.transaction_facts.
//
// SINGLE WRITER: only this module inserts into transaction_facts.
// Consumers (KPIs, performance gaps, dashboard) read from the table.
//
// Revenue authority:  Total column (gross collected, includes VAT).
// Refund detection:   Type contains 'refund'/'credit' OR Total is negative.
// Channel inference:  'online' when normalized(User) == normalized(Client).
// Date format:        DD/MM/YYYY HH:mm:ss (Lebanon local time).

import { createClient } from '@/lib/supabase/server';
import {
  buildTransactionFacts,
  parseDate,
  detectDateFormat,
  parseNumeric,
} from '@/lib/data/transaction-facts';
import type { TransactionFact, FactBuildResult } from '@/lib/data/transaction-facts';
import type { DetectedMetrics } from '@/lib/ai/ontology-detector';

export type { TransactionFact, FactBuildResult };

// ── DB row shape for public.transaction_facts ──────────────────

interface TransactionFactRow {
  org_id: string;
  upload_id: string;
  transacted_at: string;
  date_key: string;
  gross_total: number;
  discount: number | null;
  tax: number | null;
  is_refund: boolean;
  type: string;
  channel: string;
  staff_name: string | null;
  client_name: string | null;
  offering_name: string | null;
  branch_name: string | null;
  transaction_id: string | null;
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Build transaction facts from raw rows and persist to public.transaction_facts.
 *
 * Steps:
 *  1. Call buildTransactionFacts() to get in-memory canonical facts.
 *  2. Map each fact to a DB row.
 *  3. Delete existing facts for this upload_id (idempotent re-run).
 *  4. Batch-insert into transaction_facts.
 *
 * Returns the FactBuildResult for upstream logging/metrics.
 */
export async function writeTransactionFacts(
  orgId: string,
  uploadId: string,
  rawRows: { date: string | null; data: Record<string, unknown> }[],
  detectedMetrics: DetectedMetrics | null,
  columnMapping?: Record<string, string> | null,
): Promise<FactBuildResult> {
  const result = buildTransactionFacts(rawRows, detectedMetrics, columnMapping);

  if (result.facts.length === 0) {
    return result;
  }

  const supabase = await createClient();

  // Idempotent: delete any previous facts for this upload
  await supabase
    .from('transaction_facts')
    .delete()
    .eq('org_id', orgId)
    .eq('upload_id', uploadId);

  // Map in-memory facts to DB rows
  const dbRows: TransactionFactRow[] = result.facts.map((f) => ({
    org_id: orgId,
    upload_id: uploadId,
    transacted_at: f.transactedAt.toISOString(),
    date_key: f.dateKey,
    gross_total: Math.round(f.amountTotal * 100) / 100,
    discount: f.amountDiscount != null ? Math.round(f.amountDiscount * 100) / 100 : null,
    tax: f.amountTax != null ? Math.round(f.amountTax * 100) / 100 : null,
    is_refund: f.type === 'refund',
    type: f.type,
    channel: f.channel === 'online_self_checkout' ? 'online' : 'in_studio',
    staff_name: f.actorUserName,
    client_name: f.clientName,
    offering_name: f.offeringName,
    branch_name: f.branchName,
    transaction_id: f.transactionId,
  }));

  // Batch insert (500 rows at a time to avoid payload limits)
  for (let i = 0; i < dbRows.length; i += 500) {
    const batch = dbRows.slice(i, i + 500);
    const { error } = await supabase.from('transaction_facts').insert(batch);
    if (error) {
      console.error(
        `[facts/transactions] Insert batch ${i / 500 + 1} failed:`,
        error.message,
      );
    }
  }

  console.log(
    `[facts/transactions] Wrote ${dbRows.length} facts for upload ${uploadId}` +
      ` (${result.dateParseFailures} date failures, ${result.revenueParseFailures} revenue failures)`,
  );

  return result;
}

/**
 * Delete all transaction facts for a given upload.
 * Called during upload deletion cascade.
 */
export async function deleteTransactionFacts(
  orgId: string,
  uploadId: string,
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('transaction_facts')
    .delete()
    .eq('org_id', orgId)
    .eq('upload_id', uploadId);
}

// Re-export parsing utilities for use by other modules
export { parseDate, detectDateFormat, parseNumeric };
