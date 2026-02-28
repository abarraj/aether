// Builds a concise operational data context block for Claude.

import { subDays, formatISO } from 'date-fns';

import { createClient } from '@/lib/supabase/server';

type SnapshotRow = {
  date: string;
  period: string;
  metrics: {
    revenue?: number | null;
    laborCost?: number | null;
    utilization?: number | null;
  };
};

type AlertRow = {
  type: string;
  severity: string;
  title: string;
  description: string | null;
  created_at: string;
};

type EntityTypeRow = {
  id: string;
  name: string;
  slug: string;
  properties: { key: string; label: string; type: string }[];
};

type EntityRow = {
  id: string;
  entity_type_id: string;
  name: string;
  properties: Record<string, unknown>;
};

type RelRow = {
  from_entity_id: string;
  to_entity_id: string;
  relationship_types: { name: string } | null;
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function buildOntologyContext(
  entityTypes: EntityTypeRow[],
  entities: EntityRow[],
  rels: RelRow[],
  entityNameById: Map<string, string>,
): string {
  const lines: string[] = [];
  lines.push('---');
  lines.push('OPERATIONAL ONTOLOGY (Data model for this business)');
  lines.push('');

  if (entityTypes.length === 0) {
    lines.push('No entity types defined yet.');
    return lines.join('\n');
  }

  lines.push('Entity types and their properties:');
  for (const et of entityTypes) {
    const propList =
      et.properties?.length > 0
        ? et.properties.map((p) => `${p.key} (${p.type})`).join(', ')
        : 'none';
    lines.push(`- ${et.name}: ${propList}`);
  }

  lines.push('');
  lines.push('Entities by type (name and key properties):');
  for (const et of entityTypes) {
    const ofType = entities.filter((e) => e.entity_type_id === et.id);
    if (ofType.length === 0) {
      lines.push(`- ${et.name}: (none)`);
      continue;
    }
    const summaries = ofType.map((e) => {
      const keys = e.properties && typeof e.properties === 'object' ? Object.keys(e.properties as object) : [];
      const preview = keys.length > 0
        ? ` — ${keys.slice(0, 3).map((k) => `${k}: ${(e.properties as Record<string, unknown>)[k]}`).join(', ')}${keys.length > 3 ? '…' : ''}`
        : '';
      return `${e.name}${preview}`;
    });
    lines.push(`- ${et.name}: ${summaries.join('; ')}`);
  }

  const relList = rels.filter((r) => r.relationship_types?.name && entityNameById.get(r.from_entity_id) && entityNameById.get(r.to_entity_id));
  if (relList.length > 0) {
    lines.push('');
    lines.push('Relationships between entities:');
    for (const r of relList) {
      const fromName = entityNameById.get(r.from_entity_id) ?? r.from_entity_id;
      const toName = entityNameById.get(r.to_entity_id) ?? r.to_entity_id;
      lines.push(`- ${fromName} [${r.relationship_types!.name}] → ${toName}`);
    }
  }

  lines.push('---');
  return lines.join('\n');
}

async function buildRawDataContext(
  orgId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { data: rawRows } = await supabase
    .from('data_rows')
    .select('date, data, upload_id')
    .eq('org_id', orgId)
    .order('date', { ascending: false })
    .limit(200);

  if (!rawRows || rawRows.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('---');
  lines.push(
    'RAW TRANSACTION DATA (most recent rows from uploaded spreadsheets)',
  );
  lines.push('Each row represents one record from the original data source.');
  lines.push(
    'Use this data to answer granular questions about individual transactions, people, locations, dates, and line items.',
  );
  lines.push('');

  const allKeys = new Set<string>();
  for (const row of rawRows) {
    const data = row.data as Record<string, unknown>;
    for (const key of Object.keys(data)) {
      allKeys.add(key);
    }
  }
  const headers = Array.from(allKeys);

  const nonEmptyHeaders = headers.filter((h) =>
    rawRows.some((row) => {
      const data = row.data as Record<string, unknown>;
      const v = data[h];
      return v != null && String(v).trim() !== '';
    }),
  );

  if (nonEmptyHeaders.length === 0) {
    return '';
  }

  const truncate = (s: string) =>
    s.length > 50 ? `${s.slice(0, 47)}...` : s;

  lines.push(`Columns: ${nonEmptyHeaders.join(' | ')}`);
  lines.push('');

  const buildLinesForRows = (rows: typeof rawRows) => {
    const out: string[] = [];
    for (const row of rows) {
      const data = row.data as Record<string, unknown>;
      const date = row.date ?? '';
      const values = nonEmptyHeaders.map((h) => {
        const v = data[h];
        return v != null ? truncate(String(v)) : '';
      });
      const prefix = date ? `${date} | ` : '';
      out.push(`${prefix}${values.join(' | ')}`);
    }
    return out;
  };

  lines.push(...buildLinesForRows(rawRows));
  lines.push('---');

  let result = lines.join('\n');

  if (result.length > 8000) {
    const limitedRows = rawRows.slice(0, 100);
    const headerLines = lines.slice(0, lines.indexOf('') + 1); // up to blank line after Columns
    const rebuilt: string[] = [...headerLines];
    rebuilt.push(...buildLinesForRows(limitedRows));
    rebuilt.push('---');
    result = rebuilt.join('\n');
  }

  return result;
}

export async function buildDataContext(orgId: string): Promise<string> {
  const supabase = await createClient();

  const end = new Date();
  const start = subDays(end, 29);

  const [
    snapshotsResult,
    alertsResult,
    entityTypesResult,
    entitiesResult,
    relationshipsResult,
  ] = await Promise.all([
    supabase
      .from('kpi_snapshots')
      .select('date, period, metrics')
      .eq('org_id', orgId)
      .eq('period', 'daily')
      .gte('date', formatISO(start, { representation: 'date' }))
      .lte('date', formatISO(end, { representation: 'date' }))
      .order('date', { ascending: true })
      .returns<SnapshotRow[]>(),
    supabase
      .from('alerts')
      .select('type, severity, title, description, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(10)
      .returns<AlertRow[]>(),
    supabase
      .from('entity_types')
      .select('id, name, slug, properties')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true })
      .returns<EntityTypeRow[]>(),
    supabase
      .from('entities')
      .select('id, entity_type_id, name, properties')
      .eq('org_id', orgId)
      .order('entity_type_id')
      .returns<EntityRow[]>(),
    supabase
      .from('entity_relationships')
      .select('from_entity_id, to_entity_id, relationship_types(name)')
      .eq('org_id', orgId)
      .returns<RelRow[]>(),
  ]);

  const snapshots = snapshotsResult.data ?? [];
  const alerts = alertsResult.data ?? [];
  const entityTypes = entityTypesResult.data ?? [];
  const entities = entitiesResult.data ?? [];
  const relationships = relationshipsResult.data ?? [];

  const entityNameById = new Map<string, string>();
  for (const e of entities) {
    entityNameById.set(e.id, e.name);
  }

  const ontologyBlock = buildOntologyContext(
    entityTypes,
    entities,
    relationships,
    entityNameById,
  );

  const { count: totalRowCount } = await supabase
    .from('data_rows')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId);

  const rawDataBlock = await buildRawDataContext(orgId, supabase);

  if (!snapshots.length) {
    const lines: string[] = [];
    lines.push(
      'No KPI snapshots are available yet for this organization in the last 30 days.',
    );
    lines.push('');
    lines.push(
      `Total records in database: ${totalRowCount ?? 0} (showing most recent 200 in raw data section)`,
    );
    lines.push('');
    lines.push(ontologyBlock);
    if (rawDataBlock) {
      lines.push('');
      lines.push(rawDataBlock);
    }
    return lines.join('\n');
  }

  let totalRevenue = 0;
  let totalLaborCost = 0;
  let totalUtilization = 0;
  let utilizationCount = 0;

  for (const snapshot of snapshots) {
    totalRevenue += snapshot.metrics.revenue ?? 0;
    totalLaborCost += snapshot.metrics.laborCost ?? 0;
    if (snapshot.metrics.utilization != null) {
      totalUtilization += snapshot.metrics.utilization;
      utilizationCount += 1;
    }
  }

  const avgDailyRevenue = snapshots.length > 0 ? totalRevenue / snapshots.length : 0;
  const avgUtilization =
    utilizationCount > 0 ? totalUtilization / utilizationCount : null;

  const latest = snapshots[snapshots.length - 1];
  const latestRevenue = latest.metrics.revenue ?? null;
  const latestLaborCost = latest.metrics.laborCost ?? null;
  const latestUtilization = latest.metrics.utilization ?? null;

  const lines: string[] = [];

  lines.push('KPI summary for the last 30 days:');
  lines.push(
    `- Total revenue: ${Math.round(totalRevenue)} (approximate, summed across daily snapshots).`,
  );
  lines.push(
    `- Total labor cost: ${Math.round(
      totalLaborCost,
    )} (approximate, summed across daily snapshots).`,
  );
  lines.push(
    `- Average daily revenue: ${Math.round(avgDailyRevenue)} based on ${
      snapshots.length
    } days.`,
  );
  if (avgUtilization != null) {
    lines.push(
      `- Average utilization: ${avgUtilization.toFixed(
        1,
      )}% across days where utilization was recorded.`,
    );
  }

  lines.push('');
  lines.push('Most recent daily KPI snapshot:');
  lines.push(`- Date: ${latest.date}.`);
  if (latestRevenue != null) {
    lines.push(`- Revenue: ${Math.round(latestRevenue)}.`);
  }
  if (latestLaborCost != null) {
    lines.push(`- Labor cost: ${Math.round(latestLaborCost)}.`);
  }
  if (latestUtilization != null) {
    lines.push(`- Utilization: ${latestUtilization.toFixed(1)}%.`);
  }

  if (alerts && alerts.length > 0) {
    lines.push('');
    lines.push('Recent alerts and anomalies (most recent first):');
    for (const alert of alerts) {
      lines.push(
        `- [${alert.severity}] ${alert.type} — ${alert.title} (created at ${alert.created_at}).`,
      );
    }
  }
  lines.push('');
  lines.push(ontologyBlock);

  lines.push('');
  lines.push(
    `Total records in database: ${
      totalRowCount ?? 0
    } (showing most recent 200 in raw data section)`,
  );

  if (rawDataBlock) {
    lines.push('');
    lines.push(rawDataBlock);
  }

  // Add performance gap context
  try {
    const { data: gapRows } = await supabase
      .from('performance_gaps')
      .select(
        'dimension_field, dimension_value, actual_value, expected_value, gap_value, gap_pct, period_start',
      )
      .eq('org_id', orgId)
      .eq('period', 'weekly')
      .order('period_start', { ascending: false })
      .limit(50);

    if (gapRows && gapRows.length > 0) {
      lines.push('');
      lines.push('---');
      lines.push(
        'PERFORMANCE GAPS (Revenue leakage by dimension, most recent weeks)',
      );
      lines.push(
        'Gap = Expected - Actual. Positive gap means revenue left on the table.',
      );
      lines.push('');

      const byField = new Map<string, typeof gapRows>();
      for (const row of gapRows) {
        const field = row.dimension_field;
        if (!byField.has(field)) byField.set(field, []);
        byField.get(field)!.push(row);
      }

      for (const [field, fieldRows] of byField) {
        lines.push(`Dimension: ${field}`);
        const byValue = new Map<
          string,
          {
            totalActual: number;
            totalExpected: number;
            totalGap: number;
            weeks: number;
          }
        >();
        for (const row of fieldRows) {
          const v = row.dimension_value;
          const existing = byValue.get(v) ?? {
            totalActual: 0,
            totalExpected: 0,
            totalGap: 0,
            weeks: 0,
          };
          existing.totalActual += Number(row.actual_value);
          existing.totalExpected += Number(row.expected_value);
          existing.totalGap += Number(row.gap_value);
          existing.weeks++;
          byValue.set(v, existing);
        }

        const sorted = Array.from(byValue.entries()).sort(
          (a, b) => b[1].totalGap - a[1].totalGap,
        );
        for (const [value, stats] of sorted) {
          const avgGapPct =
            stats.totalExpected > 0
              ? ((stats.totalGap / stats.totalExpected) * 100).toFixed(1)
              : 'N/A';
          lines.push(
            `  - ${value}: actual=${Math.round(stats.totalActual)}, expected=${Math.round(stats.totalExpected)}, gap=${Math.round(stats.totalGap)} (${avgGapPct}% leakage over ${stats.weeks} weeks)`,
          );
        }
        lines.push('');
      }
      lines.push('---');
    }
  } catch {
    // performance_gaps table may not exist yet
  }

  // Fetch industry benchmarks for AI context
  const { data: org } = await supabase
    .from('organizations')
    .select('industry')
    .eq('id', orgId)
    .maybeSingle();

  if (org?.industry) {
    const { data: benchmarkRow } = await supabase
      .from('industry_benchmarks')
      .select('metrics, sample_size')
      .eq('industry', org.industry)
      .eq('period', 'monthly')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (benchmarkRow?.metrics) {
      const bm = benchmarkRow.metrics as Record<string, number>;
      lines.push('');
      lines.push('---');
      lines.push(
        `INDUSTRY BENCHMARKS (${org.industry}, based on ${benchmarkRow.sample_size} businesses)`,
      );
      lines.push(
        `- Median monthly revenue: ${Math.round(bm.median_monthly_revenue ?? 0)}`,
      );
      lines.push(
        `- Revenue range (25th-75th percentile): ${Math.round(
          bm.p25_monthly_revenue ?? 0,
        )} - ${Math.round(bm.p75_monthly_revenue ?? 0)}`,
      );
      lines.push(
        `- Median staff cost as % of revenue: ${(bm.median_staff_cost_pct ?? 0).toFixed(
          1,
        )}%`,
      );
      lines.push(
        `- Staff cost range (25th-75th): ${(bm.p25_staff_cost_pct ?? 0).toFixed(
          1,
        )}% - ${(bm.p75_staff_cost_pct ?? 0).toFixed(1)}%`,
      );
      lines.push(
        `- Median daily revenue: ${Math.round(bm.median_daily_revenue ?? 0)}`,
      );
      lines.push(
        `- Median capacity/utilization: ${(bm.median_capacity ?? 0).toFixed(1)}%`,
      );
      lines.push(
        "Use these benchmarks to contextualize this business's performance relative to similar businesses in the same industry.",
      );
      lines.push('---');
    }
  }

  return lines.join('\n');
}

