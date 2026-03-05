/**
 * Tests for the role inference engine.
 *
 * Mandatory assertions (per spec):
 *  1. Client is always the payer
 *  2. User==Client and NOT in payroll → client_self_checkout + PROCESSED_BY Online Checkout
 *  3. User in payroll → staff
 *  4. Revenue = SUM(Total)
 *  5. No entity_type named "User" is produced
 *  6. Regression test for "Fatima Ahmad self-checkout" pattern
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import {
  normalizePersonName,
  isTransactionalDataset,
  runRoleInference,
  filterRowsForStaffEntity,
  buildSystemActorRows,
} from '@/lib/ai/ontology-role-inference';
import type { RoleInferenceResult } from '@/lib/ai/ontology-role-inference';
import { parsePayrollXlsx } from '@/lib/data/staff-roster';
import { parseCsv } from '@/lib/csv-parser';
import type { OntologyDetection } from '@/lib/ai/ontology-detector';

// ── Paths ────────────────────────────────────────────────────────────

const FIXTURES = path.resolve(__dirname, '../../data/__fixtures__/gym');

// ── Helpers ──────────────────────────────────────────────────────────

/** Build a minimal OntologyDetection stub for tests. */
function stubDetection(): OntologyDetection {
  return {
    entityTypes: [
      { name: 'Users', slug: 'user', sourceColumn: 'User', icon: 'user', color: '#10B981', aggregatedProperties: [] },
      { name: 'Clients', slug: 'client', sourceColumn: 'Client', icon: 'user', color: '#06B6D4', aggregatedProperties: [] },
    ],
    relationships: [
      { fromTypeSlug: 'user', name: 'processed_for', toTypeSlug: 'client' },
    ],
    metrics: {
      dateColumn: 'Date',
      revenueColumns: ['Total'],
      costColumns: [],
      attendanceColumns: [],
      utilizationColumns: [],
    },
    confidence: 0.8,
    reasoning: 'AI detected User + Client entity types',
  };
}

/** Create synthetic rows with known patterns. */
function makeRows(data: { user: string; client: string; total: string; description?: string; branch?: string }[]) {
  return data.map((d) => ({
    User: d.user,
    Client: d.client,
    Total: d.total,
    Description: d.description ?? 'Some Service',
    Branch: d.branch ?? 'Main',
  }));
}

const HEADERS = ['User', 'Client', 'Total', 'Description', 'Branch'];

// ── Unit tests ──────────────────────────────────────────────────────

describe('normalizePersonName', () => {
  it('lowercases and trims', () => {
    expect(normalizePersonName('  Fatima Ahmad  ')).toBe('fatima ahmad');
  });

  it('collapses whitespace', () => {
    expect(normalizePersonName('Majdouline  Rh')).toBe('majdouline rh');
  });

  it('removes punctuation', () => {
    // Punctuation chars [.,\-'"] are stripped without replacement
    expect(normalizePersonName("O'Brien-Smith.")).toBe('obriensmith');
  });

  it('handles empty strings', () => {
    expect(normalizePersonName('')).toBe('');
  });
});

describe('isTransactionalDataset', () => {
  it('returns true when User + Client columns present', () => {
    expect(isTransactionalDataset(['User', 'Client', 'Total'])).toBe(true);
  });

  it('returns true with alternative names', () => {
    expect(isTransactionalDataset(['Cashier', 'Customer', 'Amount'])).toBe(true);
  });

  it('returns false without User column', () => {
    expect(isTransactionalDataset(['Client', 'Total', 'Description'])).toBe(false);
  });

  it('returns false without Client column', () => {
    expect(isTransactionalDataset(['User', 'Total', 'Description'])).toBe(false);
  });

  it('returns false with empty headers', () => {
    expect(isTransactionalDataset([])).toBe(false);
  });
});

// ── Core inference tests (synthetic data) ───────────────────────────

describe('runRoleInference', () => {
  const staffNames = new Set(['mahmoud', 'karim zein', 'sara assaf']);

  it('classifies staff when User is in roster', () => {
    const rows = makeRows([
      { user: 'Mahmoud', client: 'Lina Tayar', total: '30' },
    ]);
    const result = runRoleInference(rows, HEADERS, staffNames, stubDetection());

    expect(result.rowInferences[0]!.actorRole).toBe('staff');
    expect(result.rowInferences[0]!.channel).toBe('in_studio');
    expect(result.rowInferences[0]!.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.metadata.staffProcessedCount).toBe(1);
  });

  it('classifies self-checkout when User == Client and not staff', () => {
    const rows = makeRows([
      { user: 'Fatima Ahmad', client: 'Fatima Ahmad', total: '280' },
    ]);
    const result = runRoleInference(rows, HEADERS, staffNames, stubDetection());

    expect(result.rowInferences[0]!.actorRole).toBe('client_self_checkout');
    expect(result.rowInferences[0]!.channel).toBe('online_checkout');
    expect(result.metadata.selfCheckoutCount).toBe(1);
    expect(result.metadata.systemActorUsed).toBe(true);
  });

  it('classifies unknown when User not in roster and User != Client', () => {
    const rows = makeRows([
      { user: 'Origin - Massage', client: 'Erica Hobeika', total: '30' },
    ]);
    const result = runRoleInference(rows, HEADERS, staffNames, stubDetection());

    expect(result.rowInferences[0]!.actorRole).toBe('unknown');
    expect(result.needsReview).toBe(true);
    expect(result.reviewQuestions.length).toBeGreaterThan(0);
  });

  it('does NOT classify self-checkout for staff even when User == Client', () => {
    const rows = makeRows([
      { user: 'Mahmoud', client: 'Mahmoud', total: '50' },
    ]);
    const result = runRoleInference(rows, HEADERS, staffNames, stubDetection());

    // Staff match takes precedence over self-checkout
    expect(result.rowInferences[0]!.actorRole).toBe('staff');
    expect(result.metadata.selfCheckoutCount).toBe(0);
  });

  // ── Mandatory assertion 1: Client is always the payer ──

  it('[MANDATORY] Client column values are always payer in row inferences', () => {
    const rows = makeRows([
      { user: 'Mahmoud', client: 'Lina Tayar', total: '30' },
      { user: 'Fatima Ahmad', client: 'Fatima Ahmad', total: '280' },
      { user: 'Origin - Massage', client: 'Erica Hobeika', total: '30' },
    ]);
    const result = runRoleInference(rows, HEADERS, staffNames, stubDetection());

    expect(result.rowInferences[0]!.payer).toBe('Lina Tayar');
    expect(result.rowInferences[1]!.payer).toBe('Fatima Ahmad');
    expect(result.rowInferences[2]!.payer).toBe('Erica Hobeika');
  });

  // ── Mandatory assertion 5: No entity_type named "User" ──

  it('[MANDATORY] no entity type named "User" in corrected detection', () => {
    const rows = makeRows([
      { user: 'Mahmoud', client: 'Lina Tayar', total: '30' },
      { user: 'Fatima Ahmad', client: 'Fatima Ahmad', total: '280' },
    ]);
    const result = runRoleInference(rows, HEADERS, staffNames, stubDetection());

    const typeNames = result.detection.entityTypes.map((e) => e.name.toLowerCase());
    expect(typeNames).not.toContain('user');
    expect(typeNames).not.toContain('users');

    const typeSlugs = result.detection.entityTypes.map((e) => e.slug);
    expect(typeSlugs).not.toContain('user');
  });

  it('produces canonical entity types: Clients, Staff, Offerings, Branches', () => {
    const rows = makeRows([
      { user: 'Mahmoud', client: 'Lina Tayar', total: '30' },
    ]);
    const result = runRoleInference(rows, HEADERS, staffNames, stubDetection());

    const names = result.detection.entityTypes.map((e) => e.name);
    expect(names).toContain('Clients');
    expect(names).toContain('Staff');
    expect(names).toContain('Offerings');
    expect(names).toContain('Branches');
  });

  it('includes SystemActor when self-checkout is detected', () => {
    const rows = makeRows([
      { user: 'Fatima Ahmad', client: 'Fatima Ahmad', total: '280' },
    ]);
    const result = runRoleInference(rows, HEADERS, staffNames, stubDetection());

    const names = result.detection.entityTypes.map((e) => e.name);
    expect(names).toContain('System Actors');

    const systemActor = result.detection.entityTypes.find((e) => e.slug === 'system_actor');
    expect(systemActor).toBeDefined();
    expect(systemActor!.sourceColumn).toBe('__system__');
  });

  it('does NOT include SystemActor when no self-checkout detected', () => {
    const rows = makeRows([
      { user: 'Mahmoud', client: 'Lina Tayar', total: '30' },
    ]);
    const result = runRoleInference(rows, HEADERS, staffNames, stubDetection());

    const slugs = result.detection.entityTypes.map((e) => e.slug);
    expect(slugs).not.toContain('system_actor');
  });

  it('builds correct relationships: purchased, occurred_at, processed_by', () => {
    const rows = makeRows([
      { user: 'Mahmoud', client: 'Lina', total: '30', description: 'Yoga', branch: 'Main' },
    ]);
    const result = runRoleInference(rows, HEADERS, staffNames, stubDetection());

    const relNames = result.detection.relationships.map((r) => r.name);
    expect(relNames).toContain('purchased');
    expect(relNames).toContain('occurred_at');
    expect(relNames).toContain('processed_by');

    const purchased = result.detection.relationships.find((r) => r.name === 'purchased');
    expect(purchased).toEqual({ fromTypeSlug: 'client', name: 'purchased', toTypeSlug: 'offering' });

    const processedBy = result.detection.relationships.find((r) => r.name === 'processed_by');
    expect(processedBy).toEqual({ fromTypeSlug: 'offering', name: 'processed_by', toTypeSlug: 'staff' });
  });

  // ── Review questions ──

  it('generates review question for unknown actors', () => {
    const rows = makeRows([
      { user: 'Unknown Person', client: 'Some Client', total: '50' },
      { user: 'Unknown Person', client: 'Another Client', total: '75' },
    ]);
    const result = runRoleInference(rows, HEADERS, staffNames, stubDetection());

    expect(result.needsReview).toBe(true);
    const q = result.reviewQuestions.find((rq) => rq.type === 'unknown_actor');
    expect(q).toBeDefined();
    expect(q!.affectedRows).toBe(2);
    expect(q!.resolved).toBe(false);
  });

  it('does NOT need review when all actors are known', () => {
    const rows = makeRows([
      { user: 'Mahmoud', client: 'Lina Tayar', total: '30' },
      { user: 'Karim Zein', client: 'Lina Tayar', total: '50' },
    ]);
    const result = runRoleInference(rows, HEADERS, staffNames, stubDetection());

    expect(result.needsReview).toBe(false);
    expect(result.reviewQuestions.length).toBe(0);
  });

  it('suggests "staff" for unknown actors with >5 rows', () => {
    const rows = Array(8).fill(null).map(() => ({
      User: 'Frequent Unknown',
      Client: 'Some Client',
      Total: '10',
      Description: 'Service',
      Branch: 'Main',
    }));
    const result = runRoleInference(rows, HEADERS, staffNames, stubDetection());

    const q = result.reviewQuestions.find(
      (rq) => rq.type === 'unknown_actor' && rq.id.includes('frequent_unknown'),
    );
    expect(q).toBeDefined();
    expect(q!.suggestion).toBe('staff');
    expect(q!.confidence).toBe(0.7);
  });

  // ── Metadata ──

  it('produces correct metadata counts', () => {
    const rows = makeRows([
      { user: 'Mahmoud', client: 'A', total: '30' },         // staff
      { user: 'Sara Assaf', client: 'B', total: '50' },      // staff
      { user: 'Fatima Ahmad', client: 'Fatima Ahmad', total: '280' }, // self-checkout
      { user: 'Unknown', client: 'C', total: '20' },         // unknown
    ]);
    const result = runRoleInference(rows, HEADERS, staffNames, stubDetection());

    expect(result.metadata.staffProcessedCount).toBe(2);
    expect(result.metadata.selfCheckoutCount).toBe(1);
    expect(result.metadata.unknownActorCount).toBe(1);
    expect(result.metadata.systemActorUsed).toBe(true);
    expect(result.metadata.staffNamesUsed).toEqual(expect.arrayContaining(['mahmoud', 'karim zein', 'sara assaf']));
  });

  // ── Empty / edge cases ──

  it('handles empty User column', () => {
    const rows = [{ User: '', Client: 'Someone', Total: '100', Description: 'Yoga', Branch: 'Main' }];
    const result = runRoleInference(rows, HEADERS, staffNames, stubDetection());

    expect(result.rowInferences[0]!.actorRole).toBe('unknown');
    expect(result.rowInferences[0]!.explanation).toContain('empty');
  });

  it('passes through when dataset is non-transactional', () => {
    const detection = stubDetection();
    const result = runRoleInference(
      [{ Name: 'Alice', Amount: '100' }],
      ['Name', 'Amount'],
      staffNames,
      detection,
    );

    // Should return the original detection unchanged
    expect(result.detection).toBe(detection);
    expect(result.rowInferences).toHaveLength(0);
    expect(result.needsReview).toBe(false);
  });
});

// ── Row filter tests ────────────────────────────────────────────────

describe('filterRowsForStaffEntity', () => {
  it('keeps User column for staff rows', () => {
    const rows = [
      { User: 'Mahmoud', Client: 'Lina', Total: '30' },
    ];
    const inferences = [
      { rowIndex: 0, payer: 'Lina', actor: 'Mahmoud', actorRole: 'staff' as const, channel: 'in_studio' as const, confidence: 0.95, explanation: '' },
    ];

    const filtered = filterRowsForStaffEntity(rows, inferences, 'User');
    expect(filtered[0]!.User).toBe('Mahmoud');
  });

  it('nulls out User column for self-checkout rows', () => {
    const rows = [
      { User: 'Fatima Ahmad', Client: 'Fatima Ahmad', Total: '280' },
    ];
    const inferences = [
      { rowIndex: 0, payer: 'Fatima Ahmad', actor: 'Fatima Ahmad', actorRole: 'client_self_checkout' as const, channel: 'online_checkout' as const, confidence: 0.9, explanation: '' },
    ];

    const filtered = filterRowsForStaffEntity(rows, inferences, 'User');
    expect(filtered[0]!.User).toBeNull();
  });

  it('nulls out User column for unknown rows', () => {
    const rows = [
      { User: 'Origin - Massage', Client: 'Erica', Total: '30' },
    ];
    const inferences = [
      { rowIndex: 0, payer: 'Erica', actor: 'Origin - Massage', actorRole: 'unknown' as const, channel: 'unknown' as const, confidence: 0.5, explanation: '' },
    ];

    const filtered = filterRowsForStaffEntity(rows, inferences, 'User');
    expect(filtered[0]!.User).toBeNull();
  });

  it('does not mutate original rows', () => {
    const rows = [
      { User: 'Fatima Ahmad', Client: 'Fatima Ahmad', Total: '280' },
    ];
    const inferences = [
      { rowIndex: 0, payer: 'Fatima Ahmad', actor: 'Fatima Ahmad', actorRole: 'client_self_checkout' as const, channel: 'online_checkout' as const, confidence: 0.9, explanation: '' },
    ];

    filterRowsForStaffEntity(rows, inferences, 'User');
    expect(rows[0]!.User).toBe('Fatima Ahmad'); // original unchanged
  });
});

describe('buildSystemActorRows', () => {
  it('replaces User with "Online Checkout" for self-checkout rows', () => {
    const rows = [
      { User: 'Fatima Ahmad', Client: 'Fatima Ahmad', Total: '280' },
    ];
    const inferences = [
      { rowIndex: 0, payer: 'Fatima Ahmad', actor: 'Fatima Ahmad', actorRole: 'client_self_checkout' as const, channel: 'online_checkout' as const, confidence: 0.9, explanation: '' },
    ];

    const systemRows = buildSystemActorRows(rows, inferences, 'User');
    expect(systemRows[0]!.User).toBe('Online Checkout');
  });

  it('does NOT replace User for staff rows', () => {
    const rows = [
      { User: 'Mahmoud', Client: 'Lina', Total: '30' },
    ];
    const inferences = [
      { rowIndex: 0, payer: 'Lina', actor: 'Mahmoud', actorRole: 'staff' as const, channel: 'in_studio' as const, confidence: 0.95, explanation: '' },
    ];

    const systemRows = buildSystemActorRows(rows, inferences, 'User');
    expect(systemRows[0]!.User).toBe('Mahmoud');
  });

  it('does not mutate original rows', () => {
    const rows = [
      { User: 'Fatima Ahmad', Client: 'Fatima Ahmad', Total: '280' },
    ];
    const inferences = [
      { rowIndex: 0, payer: 'Fatima Ahmad', actor: 'Fatima Ahmad', actorRole: 'client_self_checkout' as const, channel: 'online_checkout' as const, confidence: 0.9, explanation: '' },
    ];

    buildSystemActorRows(rows, inferences, 'User');
    expect(rows[0]!.User).toBe('Fatima Ahmad');
  });
});

// ── Integration tests with real fixtures ────────────────────────────

describe('Integration: gym fixtures', () => {
  let salesRows: Record<string, unknown>[];
  let salesHeaders: string[];
  let staffNames: Set<string>;
  let result: RoleInferenceResult;

  beforeAll(() => {
    // Parse sales CSV
    const csvText = fs.readFileSync(path.join(FIXTURES, 'sales_report.csv'), 'utf-8');
    const parsed = parseCsv(csvText);
    salesRows = parsed.rows;
    salesHeaders = parsed.headers;

    // Parse payroll XLSX → staff names
    const payrollBuf = fs.readFileSync(path.join(FIXTURES, 'payroll.xlsx'));
    staffNames = parsePayrollXlsx(payrollBuf);

    // Run inference
    result = runRoleInference(salesRows, salesHeaders, staffNames, stubDetection());
  });

  it('parses all rows from sales_report.csv', () => {
    expect(salesRows.length).toBeGreaterThan(1300);
  });

  it('detects dataset as transactional', () => {
    expect(isTransactionalDataset(salesHeaders)).toBe(true);
  });

  it('extracts at least 15 staff names from payroll', () => {
    expect(staffNames.size).toBeGreaterThanOrEqual(15);
  });

  it('produces row-level inferences for every row', () => {
    expect(result.rowInferences.length).toBe(salesRows.length);
  });

  // ── Mandatory assertion 1: Client is always payer ──

  it('[MANDATORY] every row has Client as payer', () => {
    for (const inf of result.rowInferences) {
      const row = salesRows[inf.rowIndex]!;
      const clientValue = String(row['Client'] ?? '').trim();
      expect(inf.payer).toBe(clientValue);
    }
  });

  // ── Mandatory assertion 2: User==Client and NOT in payroll → self_checkout ──

  it('[MANDATORY] User==Client and not in payroll → client_self_checkout', () => {
    for (const inf of result.rowInferences) {
      const row = salesRows[inf.rowIndex]!;
      const rawUser = String(row['User'] ?? '').trim();
      const rawClient = String(row['Client'] ?? '').trim();
      const normalizedUser = normalizePersonName(rawUser);
      const normalizedClient = normalizePersonName(rawClient);

      if (normalizedUser === normalizedClient && normalizedUser !== '' && !staffNames.has(normalizedUser)) {
        expect(inf.actorRole).toBe('client_self_checkout');
        expect(inf.channel).toBe('online_checkout');
      }
    }
  });

  // ── Mandatory assertion 3: User in payroll → staff ──

  it('[MANDATORY] User in payroll → staff', () => {
    for (const inf of result.rowInferences) {
      const row = salesRows[inf.rowIndex]!;
      const rawUser = String(row['User'] ?? '').trim();
      const normalizedUser = normalizePersonName(rawUser);

      if (staffNames.has(normalizedUser)) {
        expect(inf.actorRole).toBe('staff');
      }
    }
  });

  // ── Mandatory assertion 4: Revenue = SUM(Total) ──

  it('[MANDATORY] total revenue equals SUM(Total) column', () => {
    let expectedTotal = 0;
    for (const row of salesRows) {
      const val = Number(String(row['Total'] ?? '0').replace(/[,$%]/g, ''));
      if (!Number.isNaN(val)) {
        expectedTotal += val;
      }
    }

    // Verify the detection revenue column is Total
    expect(result.detection.metrics.revenueColumns).toContain('Total');

    // The total should be ~73,114.50
    expect(expectedTotal).toBeGreaterThan(70000);
    expect(expectedTotal).toBeLessThan(80000);
  });

  // ── Mandatory assertion 5: No "User" entity type ──

  it('[MANDATORY] no entity type named "User" in corrected detection', () => {
    for (const et of result.detection.entityTypes) {
      expect(et.name.toLowerCase()).not.toBe('user');
      expect(et.name.toLowerCase()).not.toBe('users');
      expect(et.slug).not.toBe('user');
    }
  });

  // ── Mandatory assertion 6: Fatima Ahmad self-checkout regression ──

  it('[MANDATORY][REGRESSION] Fatima Ahmad rows classified as self-checkout', () => {
    const fatimaRows = result.rowInferences.filter((inf) => {
      const row = salesRows[inf.rowIndex]!;
      return String(row['User'] ?? '').trim() === 'Fatima Ahmad';
    });

    expect(fatimaRows.length).toBeGreaterThan(0);

    for (const inf of fatimaRows) {
      expect(inf.actorRole).toBe('client_self_checkout');
      expect(inf.channel).toBe('online_checkout');
    }
  });

  // ── Additional integration assertions ──

  it('detects self-checkout rows', () => {
    expect(result.metadata.selfCheckoutCount).toBeGreaterThan(100);
    expect(result.metadata.systemActorUsed).toBe(true);
  });

  it('flags unknown actors for review', () => {
    expect(result.needsReview).toBe(true);
    expect(result.reviewQuestions.length).toBeGreaterThan(0);

    const unknownQ = result.reviewQuestions.filter((q) => q.type === 'unknown_actor');
    expect(unknownQ.length).toBeGreaterThan(0);
  });

  it('suggests "staff" for Mahmoud (frequent unknown actor)', () => {
    const mahmoudQ = result.reviewQuestions.find(
      (q) => q.type === 'unknown_actor' && q.id.includes('mahmoud'),
    );
    expect(mahmoudQ).toBeDefined();
    expect(mahmoudQ!.suggestion).toBe('staff');
    expect(mahmoudQ!.affectedRows).toBeGreaterThan(500);
  });

  it('has SystemActor entity type in corrected detection', () => {
    const systemActor = result.detection.entityTypes.find(
      (e) => e.slug === 'system_actor',
    );
    expect(systemActor).toBeDefined();
    expect(systemActor!.name).toBe('System Actors');
    expect(systemActor!.sourceColumn).toBe('__system__');
  });

  it('corrected detection has canonical entity types', () => {
    const names = result.detection.entityTypes.map((e) => e.name);
    expect(names).toContain('Clients');
    expect(names).toContain('Staff');
    expect(names).toContain('Offerings');
    expect(names).toContain('Branches');
    expect(names).toContain('System Actors');
  });

  it('corrected detection has canonical relationships', () => {
    const relNames = result.detection.relationships.map((r) => r.name);
    expect(relNames).toContain('purchased');
    expect(relNames).toContain('occurred_at');
    expect(relNames).toContain('processed_by');
  });

  // ── Row filter integration ──

  it('filterRowsForStaffEntity nulls non-staff Users', () => {
    const userCol = 'User';
    const filtered = filterRowsForStaffEntity(salesRows, result.rowInferences, userCol);

    for (let i = 0; i < filtered.length; i++) {
      const inf = result.rowInferences[i]!;
      if (inf.actorRole !== 'staff') {
        expect(filtered[i]![userCol]).toBeNull();
      }
    }
  });

  it('buildSystemActorRows replaces self-checkout with "Online Checkout"', () => {
    const userCol = 'User';
    const systemRows = buildSystemActorRows(salesRows, result.rowInferences, userCol);

    for (let i = 0; i < systemRows.length; i++) {
      const inf = result.rowInferences[i]!;
      if (inf.actorRole === 'client_self_checkout') {
        expect(systemRows[i]![userCol]).toBe('Online Checkout');
      }
    }
  });

  it('every inference has an explanation string', () => {
    for (const inf of result.rowInferences) {
      expect(typeof inf.explanation).toBe('string');
      expect(inf.explanation.length).toBeGreaterThan(0);
    }
  });

  it('reconciliation score is between 0 and 1', () => {
    expect(result.metadata.revenueReconciliationScore).toBeGreaterThanOrEqual(0);
    expect(result.metadata.revenueReconciliationScore).toBeLessThanOrEqual(1);
  });
});

// ── Payroll parser integration ──────────────────────────────────────

describe('parsePayrollXlsx', () => {
  it('extracts staff names from payroll fixture', () => {
    const buf = fs.readFileSync(path.join(FIXTURES, 'payroll.xlsx'));
    const names = parsePayrollXlsx(buf);

    // Should contain known instructor names from sheet names
    expect(names.has('niki farnaz')).toBe(true);
    expect(names.has('karim zein')).toBe(true);
    expect(names.has('sara assaf')).toBe(true);
    expect(names.has('ghenwa bazzi')).toBe(true);
    expect(names.has('juliana haddad')).toBe(true);
    expect(names.has('andrea tambe')).toBe(true);
    expect(names.has('aceel jawad')).toBe(true);

    // Should also extract from Instructor column in Total sheet
    expect(names.has('amusia sukkar')).toBe(true);
    expect(names.has('yara jabbour')).toBe(true);
  });

  it('returns a non-empty Set', () => {
    const buf = fs.readFileSync(path.join(FIXTURES, 'payroll.xlsx'));
    const names = parsePayrollXlsx(buf);
    expect(names.size).toBeGreaterThan(0);
  });
});
