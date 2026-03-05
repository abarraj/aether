#!/usr/bin/env npx tsx
/**
 * Lightweight verification script for AI detection.
 * Loads a CSV fixture from disk, computes column statistics, and prints
 * what the detection model would receive. Does NOT call the Anthropic API
 * (no API key needed).
 *
 * Usage:
 *   npx tsx scripts/verify-detection.ts path/to/file.csv
 *   npx tsx scripts/verify-detection.ts --help
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ── Inline CSV parser (no imports from Next.js modules) ────────

function parseCsvSimple(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = lines[0]!.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i]!.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]!] = values[j] ?? '';
    }
    rows.push(row);
  }

  return { headers, rows };
}

// ── Column statistics (mirrored from ontology-detector.ts) ─────

interface ColumnStat {
  name: string;
  uniqueCount: number;
  totalCount: number;
  sampleValues: string[];
  dataType: 'numeric' | 'date' | 'text' | 'boolean';
  uniquenessRatio: number;
}

function inferColumnType(values: string[]): ColumnStat['dataType'] {
  let numeric = 0;
  let date = 0;
  let boolean = 0;
  const sample = values.slice(0, 200);

  for (const v of sample) {
    if (!v) continue;
    const s = v.trim();
    if (/^(true|false|yes|no|1|0)$/i.test(s)) { boolean++; continue; }
    if (!Number.isNaN(Number(s)) && s !== '') { numeric++; continue; }
    if (/^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)) { date++; continue; }
  }

  const n = sample.filter((v) => v.trim() !== '').length;
  if (n === 0) return 'text';
  if (boolean / n > 0.8) return 'boolean';
  if (numeric / n > 0.8) return 'numeric';
  if (date / n > 0.5) return 'date';
  return 'text';
}

function computeStats(rows: Record<string, string>[], headers: string[]): ColumnStat[] {
  const totalCount = rows.length;
  return headers.map((name) => {
    const values = rows.map((r) => r[name] ?? '').filter((v) => v.trim() !== '');
    const uniqueSet = new Set(values.map((v) => v.trim()));
    return {
      name,
      uniqueCount: uniqueSet.size,
      totalCount,
      sampleValues: Array.from(uniqueSet).slice(0, 5),
      dataType: inferColumnType(values),
      uniquenessRatio: totalCount > 0 ? uniqueSet.size / totalCount : 0,
    };
  });
}

// ── Stream type heuristic (simple local classification) ────────

function guessStreamType(headers: string[], stats: ColumnStat[]): string {
  const headerSet = new Set(headers.map((h) => h.toLowerCase().trim()));
  const allHeaders = headers.map((h) => h.toLowerCase().trim());

  // Staff roster signals
  const staffSignals = ['instructor', 'instructors', 'employee', 'employees', 'staff', 'staff name', 'coach', 'trainer'];
  if (staffSignals.some((s) => headerSet.has(s))) return 'staff_roster';

  // Client roster signals
  const clientSignals = ['client', 'clients', 'customer', 'customers', 'member', 'members'];
  const hasOnlyClients = clientSignals.some((s) => headerSet.has(s));
  const hasRevenue = stats.some((s) => ['revenue', 'amount', 'total', 'price', 'sales'].includes(s.name.toLowerCase()) && s.dataType === 'numeric');
  if (hasOnlyClients && !hasRevenue) return 'client_roster';

  // Schedule signals
  const scheduleSignals = ['time', 'slot', 'shift', 'class time', 'start time', 'end time'];
  if (scheduleSignals.some((s) => allHeaders.some((h) => h.includes(s)))) return 'schedule';

  // Inventory signals
  const inventorySignals = ['sku', 'quantity', 'stock', 'barcode', 'item'];
  if (inventorySignals.some((s) => headerSet.has(s))) return 'inventory';

  // Transaction/sales signals
  if (hasRevenue) return 'transactions_sales';

  return 'unknown';
}

// ── Main ───────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help')) {
    console.log('Usage: npx tsx scripts/verify-detection.ts <path-to-csv>');
    console.log('');
    console.log('Prints column statistics and inferred stream type for a CSV file.');
    console.log('Does NOT call the Anthropic API.');
    process.exit(0);
  }

  const filePath = path.resolve(args[0]!);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const text = fs.readFileSync(filePath, 'utf-8');
  const { headers, rows } = parseCsvSimple(text);

  if (headers.length === 0) {
    console.error('No headers found in CSV.');
    process.exit(1);
  }

  const stats = computeStats(rows, headers);
  const streamType = guessStreamType(headers, stats);

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  File: ${path.basename(filePath)}`);
  console.log(`  Rows: ${rows.length}`);
  console.log(`  Columns: ${headers.length}`);
  console.log(`  Inferred stream type: ${streamType}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  console.log('Column Statistics:');
  console.log('─────────────────────────────────────────────────');

  for (const stat of stats) {
    const ratio = stat.uniquenessRatio.toFixed(2);
    const isEntity = stat.dataType === 'text' && stat.uniquenessRatio < 0.5 && stat.uniqueCount >= 2;
    const entityTag = isEntity ? ' ← LIKELY ENTITY' : '';
    const dateTag = stat.dataType === 'date' ? ' ← DATE COLUMN' : '';
    const revenueTag = stat.dataType === 'numeric' && ['revenue', 'amount', 'total', 'price', 'sales', 'net', 'gross'].includes(stat.name.toLowerCase()) ? ' ← REVENUE' : '';

    console.log(`  ${stat.name}`);
    console.log(`    type=${stat.dataType}  unique=${stat.uniqueCount}/${stat.totalCount}  ratio=${ratio}${entityTag}${dateTag}${revenueTag}`);
    console.log(`    samples: ${stat.sampleValues.slice(0, 4).join(', ')}`);
    console.log('');
  }

  console.log('─────────────────────────────────────────────────');
  console.log(`Stream Type: ${streamType}`);
  console.log('');

  // Detect likely revenue columns
  const revenueColumns = stats
    .filter((s) => s.dataType === 'numeric' && ['revenue', 'amount', 'total', 'price', 'sales', 'net', 'gross', 'income'].includes(s.name.toLowerCase()))
    .map((s) => s.name);

  const dateColumn = stats.find((s) => s.dataType === 'date')?.name ?? null;
  const entityColumns = stats
    .filter((s) => s.dataType === 'text' && s.uniquenessRatio < 0.5 && s.uniqueCount >= 2)
    .map((s) => s.name);

  console.log('Detection Summary:');
  console.log(`  dateColumn: ${dateColumn ?? '(none)'}`);
  console.log(`  revenueColumns: [${revenueColumns.join(', ') || '(none)'}]`);
  console.log(`  entityTypes: [${entityColumns.join(', ') || '(none)'}]`);
  console.log('');

  process.exit(0);
}

main();
