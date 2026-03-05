// Performance gap engine v3 — FACT LAYER.
// Reads from public.transaction_facts (canonical facts).
// Computes revenue leakage ONLY for staff in public.staff_directory.
//
// Leakage v1:
//   baseline = rolling median of staff member's own previous 4 weeks
//   leakage  = max(0, baseline - actual)
//
// NO max-performer fallback. If insufficient history, gap = 0.
// Only active staff (is_active = true) are included.

import { parseISO, startOfISOWeek } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { loadActiveStaff } from '@/lib/data/facts/staff';

// ── Types ──────────────────────────────────────────────────────

interface TransactionFactRow {
  transacted_at: string;
  gross_total: number;
  is_refund: boolean;
  staff_name: string | null;
  channel: string;
}

export interface LeakageExplanation {
  baseline: number;
  actual: number;
  weeksUsed: number;
  insufficient: boolean;
  method: 'rolling_median_4w';
}

// ── Helpers ────────────────────────────────────────────────────

function toWeekStart(dateStr: string): string | null {
  try {
    return startOfISOWeek(parseISO(dateStr)).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function normalizeStaffName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ── Rolling Median Baseline ─────────────────────────────────────

/**
 * Compute rolling baseline for each staff member per week.
 * Uses median of the staff member's own previous N weeks (default 4).
 * NO max-performer fallback — if insufficient history, baseline = 0.
 */
function computeRollingBaselines(
  weeklyActuals: Map<string, Map<string, number>>,
  sortedWeeks: string[],
  lookback = 4,
): Map<string, Map<string, { baseline: number; weeksUsed: number }>> {
  const result = new Map<string, Map<string, { baseline: number; weeksUsed: number }>>();

  for (const [staffName, weekMap] of weeklyActuals) {
    const baselines = new Map<string, { baseline: number; weeksUsed: number }>();

    for (let i = 0; i < sortedWeeks.length; i++) {
      const week = sortedWeeks[i];
      const prevActuals: number[] = [];
      for (let j = Math.max(0, i - lookback); j < i; j++) {
        const prevWeek = sortedWeeks[j];
        const val = weekMap.get(prevWeek);
        if (val !== undefined && val > 0) prevActuals.push(val);
      }

      // Need at least 3 weeks of history for a meaningful baseline
      baselines.set(week, {
        baseline: prevActuals.length >= 3 ? median(prevActuals) : 0,
        weeksUsed: prevActuals.length,
      });
    }

    result.set(staffName, baselines);
  }

  return result;
}

// ── Main Computation ────────────────────────────────────────────

export async function computePerformanceGaps(
  orgId: string,
  uploadId: string,
): Promise<void> {
  const supabase = await createClient();

  // ── 1. Load active staff from staff_directory ──────────────────
  const activeStaff = await loadActiveStaff(orgId);
  if (activeStaff.size === 0) {
    console.log('[performance-gaps] No active staff in directory — skipping leakage');
    return;
  }

  // ── 2. Fetch transaction facts for this upload ─────────────────
  const { data: facts, error: factsError } = await supabase
    .from('transaction_facts')
    .select('transacted_at, gross_total, is_refund, staff_name, channel')
    .eq('org_id', orgId)
    .eq('upload_id', uploadId)
    .returns<TransactionFactRow[]>();

  if (factsError || !facts || facts.length === 0) {
    console.log('[performance-gaps] No transaction facts found — skipping');
    return;
  }

  // ── 3. Build weekly actuals per staff member ───────────────────
  // Only include staff that exist in staff_directory (is_active = true)
  const weeklyActuals = new Map<string, Map<string, number>>();
  const weekSet = new Set<string>();

  for (const fact of facts) {
    if (!fact.staff_name) continue;

    // Normalize and check against staff directory
    const normalized = normalizeStaffName(fact.staff_name);
    if (!activeStaff.has(normalized)) continue;

    // Derive date from transacted_at (table has no date_key column)
    const weekStart = toWeekStart(fact.transacted_at.slice(0, 10));
    if (!weekStart) continue;

    weekSet.add(weekStart);

    // Use display name as the dimension value
    const displayName = fact.staff_name.trim();
    if (!weeklyActuals.has(displayName)) {
      weeklyActuals.set(displayName, new Map());
    }

    const weekMap = weeklyActuals.get(displayName)!;
    // Refunds subtract from revenue
    const revenue = fact.is_refund ? -Math.abs(fact.gross_total) : fact.gross_total;
    weekMap.set(weekStart, (weekMap.get(weekStart) ?? 0) + revenue);
  }

  if (weeklyActuals.size === 0) {
    console.log('[performance-gaps] No staff-attributed revenue — skipping');
    return;
  }

  const sortedWeeks = [...weekSet].sort();

  // ── 4. Compute rolling baselines per staff ─────────────────────
  const baselines = computeRollingBaselines(weeklyActuals, sortedWeeks);

  // ── 5. Build performance_gaps rows ─────────────────────────────
  const upsertRows: {
    org_id: string;
    upload_id: string;
    metric: string;
    period: string;
    period_start: string;
    dimension_field: string;
    dimension_value: string;
    actual_value: number;
    expected_value: number;
    gap_value: number;
    gap_pct: number | null;
  }[] = [];

  for (const [staffName, weekMap] of weeklyActuals) {
    const staffBaselines = baselines.get(staffName);

    for (const [weekStart, actual] of weekMap) {
      const baselineInfo = staffBaselines?.get(weekStart);
      const baseline = baselineInfo?.baseline ?? 0;

      // NO max-performer fallback — if baseline is 0 (insufficient history), gap = 0
      const expectedValue = baseline;
      const gapValue = Math.max(expectedValue - actual, 0);
      const gapPct = expectedValue > 0
        ? Math.round((gapValue / expectedValue) * 10000) / 100
        : null;

      upsertRows.push({
        org_id: orgId,
        upload_id: uploadId,
        metric: 'revenue',
        period: 'weekly',
        period_start: weekStart,
        dimension_field: 'staff_name',
        dimension_value: staffName,
        actual_value: Math.round(actual * 100) / 100,
        expected_value: Math.round(expectedValue * 100) / 100,
        gap_value: Math.round(gapValue * 100) / 100,
        gap_pct: gapPct,
      });
    }
  }

  if (upsertRows.length === 0) return;

  // ── 6. Persist: delete old gaps for this upload, insert new ────
  await supabase
    .from('performance_gaps')
    .delete()
    .eq('org_id', orgId)
    .eq('upload_id', uploadId);

  for (let i = 0; i < upsertRows.length; i += 500) {
    const batch = upsertRows.slice(i, i + 500);
    const { error } = await supabase.from('performance_gaps').insert(batch);
    if (error) {
      console.error('performance_gaps insert error:', error.message);
    }
  }

  console.log(
    `[performance-gaps] Wrote ${upsertRows.length} gaps for ${weeklyActuals.size} staff across ${sortedWeeks.length} weeks`,
  );

  // ── 7. Update active targets with latest gap data ──────────────
  try {
    const { data: activeTargets } = await supabase
      .from('action_targets')
      .select('id, dimension_field, dimension_value, baseline_gap, target_pct')
      .eq('org_id', orgId)
      .eq('status', 'active');

    if (activeTargets && activeTargets.length > 0) {
      for (const target of activeTargets) {
        const matchingGaps = upsertRows.filter(
          (r) =>
            r.dimension_field === target.dimension_field &&
            r.dimension_value === target.dimension_value,
        );
        if (matchingGaps.length === 0) continue;

        const sorted = matchingGaps.sort((a, b) =>
          b.period_start.localeCompare(a.period_start),
        );
        const latestGap = sorted[0].gap_value;
        const pctChange =
          (target.baseline_gap as number) > 0
            ? ((target.baseline_gap as number) - latestGap) /
              (target.baseline_gap as number) *
              100
            : 0;

        const isMet = pctChange >= (target.target_pct ?? 50);

        await supabase
          .from('action_targets')
          .update({
            current_gap: latestGap,
            current_pct_change: Math.round(pctChange * 100) / 100,
            last_checked_at: new Date().toISOString(),
            status: isMet ? 'completed' : 'active',
            completed_at: isMet ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', target.id);
      }
    }
  } catch (err) {
    console.error('Target update failed:', err);
  }
}
