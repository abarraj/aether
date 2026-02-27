/**
 * Ontology detection: analyze CSV-shaped data with Claude to infer entity types,
 * relationships, and metrics. Used after upload to auto-build the data model.
 */

export interface DetectedEntityType {
  name: string;
  slug: string;
  sourceColumn: string;
  icon: string;
  color: string;
  aggregatedProperties: {
    sourceColumn: string;
    key: string;
    label: string;
    type: 'currency' | 'number' | 'percentage';
    aggregation: 'sum' | 'average' | 'count' | 'min' | 'max';
  }[];
}

export interface DetectedRelationship {
  fromTypeSlug: string;
  name: string;
  toTypeSlug: string;
}

export interface DetectedMetrics {
  dateColumn: string | null;
  revenueColumns: string[];
  costColumns: string[];
  attendanceColumns: string[];
  utilizationColumns: string[];
}

export interface OntologyDetection {
  entityTypes: DetectedEntityType[];
  relationships: DetectedRelationship[];
  metrics: DetectedMetrics;
  confidence: number;
  reasoning: string;
}

const ALLOWED_ICONS = new Set([
  'user', 'building2', 'mappin', 'package', 'dollarsign', 'calendar', 'briefcase',
  'graduationcap', 'heart', 'truck', 'shoppingcart', 'coffee', 'dumbbell', 'music',
  'wrench', 'zap', 'star', 'tag', 'clock', 'barchart3',
]);

const ALLOWED_COLORS = [
  '#10B981', '#06B6D4', '#F59E0B', '#F43F5E', '#8B5CF6', '#64748B',
];

function isValidDetection(raw: unknown): raw is OntologyDetection {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.entityTypes) || !Array.isArray(o.relationships)) return false;
  if (typeof o.confidence !== 'number' || o.confidence < 0 || o.confidence > 1) return false;
  if (typeof o.reasoning !== 'string') return false;
  if (!o.metrics || typeof o.metrics !== 'object') return false;
  return true;
}

function normalizeDetection(det: OntologyDetection): OntologyDetection {
  return {
    ...det,
    entityTypes: (det.entityTypes ?? []).map((et) => ({
      ...et,
      icon: ALLOWED_ICONS.has(et.icon?.toLowerCase()) ? et.icon.toLowerCase() : 'circle',
      color: ALLOWED_COLORS.includes(et.color) ? et.color : '#10B981',
      aggregatedProperties: Array.isArray(et.aggregatedProperties) ? et.aggregatedProperties : [],
    })),
    relationships: Array.isArray(det.relationships) ? det.relationships : [],
    metrics: det.metrics ?? {
      dateColumn: null,
      revenueColumns: [],
      costColumns: [],
      attendanceColumns: [],
      utilizationColumns: [],
    },
  };
}

export interface ColumnStat {
  name: string;
  uniqueCount: number;
  totalCount: number;
  sampleValues: string[];
  dataType: 'numeric' | 'date' | 'text' | 'boolean';
  uniquenessRatio: number;
}

function inferColumnType(values: (string | number | boolean | null)[]): 'numeric' | 'date' | 'text' | 'boolean' {
  let numeric = 0;
  let date = 0;
  let boolean = 0;
  const sample = values.slice(0, 200);

  for (const v of sample) {
    if (v === null || v === undefined || v === '') continue;
    const s = String(v).trim();
    if (/^(true|false|yes|no|1|0)$/i.test(s)) {
      boolean++;
      continue;
    }
    if (!Number.isNaN(Number(s)) && s !== '') {
      numeric++;
      continue;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)) {
      date++;
      continue;
    }
  }

  const n = sample.filter((v) => v != null && String(v).trim() !== '').length;
  if (n === 0) return 'text';
  if (boolean / n > 0.8) return 'boolean';
  if (numeric / n > 0.8) return 'numeric';
  if (date / n > 0.5) return 'date';
  return 'text';
}

export function computeColumnStatistics(
  rows: Record<string, unknown>[],
  headers: string[],
): ColumnStat[] {
  const totalCount = rows.length;
  return headers.map((name) => {
    const values = rows
      .map((r) => r[name])
      .filter((v) => v !== undefined && v !== null && String(v).trim() !== '');
    const uniqueSet = new Set(values.map((v) => String(v).trim()));
    const uniqueCount = uniqueSet.size;
    const sampleValues = Array.from(uniqueSet).slice(0, 5);
    const dataType = inferColumnType(values as (string | number | boolean | null)[]);
    const uniquenessRatio = totalCount > 0 ? uniqueCount / totalCount : 0;

    return {
      name,
      uniqueCount,
      totalCount,
      sampleValues,
      dataType,
      uniquenessRatio,
    };
  });
}

const SYSTEM_PROMPT = `You are Aether's data intelligence engine. You analyze business operational data to understand the structure of a business — its people, places, products, and how they connect.

You think like a management consultant who's been handed a spreadsheet and needs to understand the business in 30 seconds. You look for:

1. ENTITIES: Columns with repeating categorical values that represent real-world things — people (employees, instructors, managers), places (locations, branches, studios), categories (class types, product lines, departments), time slots, etc.

   NOT entities: dates, numeric values, IDs, boolean flags, notes/descriptions.

   A column is likely an entity if:
   - It has significantly fewer unique values than total rows (high repetition)
   - The values are proper nouns or categorical labels
   - Multiple numeric columns could be "about" this entity

   When choosing aggregation methods, think about what makes business sense:
   - Revenue, costs, sales → use 'sum' (totals make sense)
   - Rates, percentages, ratios → use 'average' (averaging averages is usually wrong, but it's the best default)
   - Counts of people, items, sessions → use 'sum' for totals, 'average' ONLY when the label implies per-unit measurement
   - Class size, group size, party size → use 'average' but ONLY if the column represents individual session sizes. If it represents total attendance, use 'sum' instead.
   - Be conservative with averages. If a column called 'attendance' has values like 30, 45, 50, those are likely per-session counts that should be SUMMED for the total, not averaged.
   - When creating property labels, make them precise: 'Total Revenue' not just 'Revenue', 'Avg Revenue per Session' not 'Revenue Average'.

2. PROPERTIES: For each entity, which numeric columns describe it? Revenue per instructor, cost per location, attendance per class type. These become aggregated properties that give each entity its business meaning.

3. RELATIONSHIPS: If two entity columns appear in the same row, the entities in those columns have a relationship. An instructor column and a location column in the same row means instructors work at locations.

4. METRICS: Which columns are the core business metrics? Identify date columns, revenue columns, cost columns, attendance/volume columns.

Be conservative. Only detect clear, obvious entity types. A column with 100 unique values out of 100 rows is NOT an entity — it's an identifier. A column with 3-30 unique values out of 100+ rows IS likely an entity.

Respond ONLY with valid JSON. No markdown. No backticks. No explanation outside the JSON structure.`;

function buildUserPrompt(
  headers: string[],
  columnStats: ColumnStat[],
  sampleRows: Record<string, unknown>[],
  totalRows: number,
): string {
  const statsBlock = columnStats
    .map(
      (s) =>
        `- ${s.name}: unique=${s.uniqueCount}, total=${s.totalCount}, uniqueness_ratio=${s.uniquenessRatio.toFixed(2)}, type=${s.dataType}, sample=${JSON.stringify(s.sampleValues)}`,
    )
    .join('\n');

  return `Analyze this business data CSV.

Column headers: ${JSON.stringify(headers)}

Column statistics:
${statsBlock}

Sample rows (first 15 rows):
${JSON.stringify(sampleRows.slice(0, 15))}

Total rows in dataset: ${totalRows}

Return this exact JSON structure:
{
  "entityTypes": [
    {
      "name": "Human readable name",
      "slug": "snake_case_name",
      "sourceColumn": "exact_column_header",
      "icon": "lucide_icon_name",
      "color": "#hexcolor",
      "aggregatedProperties": [
        {
          "sourceColumn": "revenue",
          "key": "total_revenue",
          "label": "Total Revenue",
          "type": "currency",
          "aggregation": "sum"
        }
      ]
    }
  ],
  "relationships": [
    {
      "fromTypeSlug": "instructor",
      "name": "teaches_at",
      "toTypeSlug": "location"
    }
  ],
  "metrics": {
    "dateColumn": "date",
    "revenueColumns": ["revenue"],
    "costColumns": ["labor_cost"],
    "attendanceColumns": ["attendance"],
    "utilizationColumns": []
  },
  "confidence": 0.85,
  "reasoning": "Brief explanation of what was detected and why"
}

Icon must be one of: user, building2, mappin, package, dollarsign, calendar, briefcase, graduationcap, heart, truck, shoppingcart, coffee, dumbbell, music, wrench, zap, star, tag, clock, barchart3

Color must be one of: #10B981, #06B6D4, #F59E0B, #F43F5E, #8B5CF6, #64748B`;
}

const FALLBACK_DETECTION: OntologyDetection = {
  entityTypes: [],
  relationships: [],
  metrics: {
    dateColumn: null,
    revenueColumns: [],
    costColumns: [],
    attendanceColumns: [],
    utilizationColumns: [],
  },
  confidence: 0,
  reasoning: 'Could not analyze this dataset automatically.',
};

function extractJsonFromText(text: string): string | null {
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  return text.slice(first, last + 1);
}

/**
 * Detect entity types, relationships, and metrics from CSV-shaped rows using Claude.
 * Pre-computes column statistics and sends a structured prompt. 30s timeout.
 */
export async function detectOntology(
  headers: string[],
  rows: Record<string, unknown>[],
  _orgId: string,
): Promise<OntologyDetection> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ...FALLBACK_DETECTION, reasoning: 'ANTHROPIC_API_KEY not configured.' };
  }

  if (headers.length === 0 || rows.length === 0) {
    return { ...FALLBACK_DETECTION, reasoning: 'No headers or rows provided.' };
  }

  const columnStats = computeColumnStatistics(rows, headers);
  const userPrompt = buildUserPrompt(headers, columnStats, rows, rows.length);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      return {
        ...FALLBACK_DETECTION,
        reasoning: `API error: ${response.status} ${errText.slice(0, 200)}`,
      };
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const textBlock = data.content?.find((c) => c.type === 'text');
    const rawText = textBlock?.text ?? '';

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const extracted = extractJsonFromText(rawText);
      if (extracted) {
        try {
          parsed = JSON.parse(extracted);
        } catch {
          return FALLBACK_DETECTION;
        }
      } else {
        return FALLBACK_DETECTION;
      }
    }

    if (!isValidDetection(parsed)) {
      return FALLBACK_DETECTION;
    }

    return normalizeDetection(parsed);
  } catch (err) {
    clearTimeout(timeoutId);
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...FALLBACK_DETECTION,
      reasoning: `Detection failed: ${message.slice(0, 150)}`,
    };
  }
}
