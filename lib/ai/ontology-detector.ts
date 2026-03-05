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

export type StreamType =
  | 'transactions_sales'
  | 'staff_roster'
  | 'client_roster'
  | 'inventory'
  | 'schedule'
  | 'unknown';

export interface OntologyDetection {
  entityTypes: DetectedEntityType[];
  relationships: DetectedRelationship[];
  metrics: DetectedMetrics;
  confidence: number;
  reasoning: string;
  streamType: StreamType;
  /** A single, simple clarifying question when confidence < 0.5. */
  clarifyingQuestion?: string;
}

const ALLOWED_ICONS = new Set([
  'user', 'building2', 'mappin', 'package', 'dollarsign', 'calendar', 'briefcase',
  'graduationcap', 'heart', 'truck', 'shoppingcart', 'coffee', 'dumbbell', 'music',
  'wrench', 'zap', 'star', 'tag', 'clock', 'barchart3',
]);

const ALLOWED_COLORS = [
  '#10B981', '#06B6D4', '#F59E0B', '#F43F5E', '#8B5CF6', '#64748B',
];

const VALID_STREAM_TYPES = new Set<string>([
  'transactions_sales', 'staff_roster', 'client_roster', 'inventory', 'schedule', 'unknown',
]);

function isValidDetection(raw: unknown): raw is OntologyDetection {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.entityTypes) || !Array.isArray(o.relationships)) return false;
  if (typeof o.confidence !== 'number' || o.confidence < 0 || o.confidence > 1) return false;
  if (typeof o.reasoning !== 'string') return false;
  if (!o.metrics || typeof o.metrics !== 'object') return false;
  // streamType is required in schema but tolerated if missing (we default to 'unknown')
  return true;
}

function normalizeDetection(det: OntologyDetection): OntologyDetection {
  const rawStreamType = (det as Record<string, unknown>).streamType;
  const streamType: StreamType =
    typeof rawStreamType === 'string' && VALID_STREAM_TYPES.has(rawStreamType)
      ? (rawStreamType as StreamType)
      : 'unknown';

  return {
    ...det,
    streamType,
    clarifyingQuestion:
      det.confidence < 0.5 && typeof det.clarifyingQuestion === 'string'
        ? det.clarifyingQuestion
        : undefined,
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

You think like a management consultant who's been handed a spreadsheet and needs to understand the business in 30 seconds.

STEP 0 — CLASSIFY THE FILE (streamType):
Before anything else, determine what kind of data this file contains:
- "transactions_sales" — rows represent sales, invoices, payments, bookings, orders. Has monetary amounts and usually dates.
- "staff_roster" — a list of employees, instructors, coaches, staff members. May have NO revenue columns at all. Columns like INSTRUCTORS, Employee Name, Staff are strong signals.
- "client_roster" — a list of clients, customers, members. May have NO revenue columns.
- "inventory" — product/item lists with quantities, SKUs, prices.
- "schedule" — class schedules, shift schedules, appointment slots. Has time slots and day/date columns.
- "unknown" — if you genuinely can't tell.

CRITICAL: Not every file has revenue. A staff list is valid data. A schedule is valid data. Do NOT require monetary columns.

STEP 1 — ENTITIES: Columns with repeating categorical values that represent real-world things — people (employees, instructors, managers), places (locations, branches, studios), categories (class types, product lines, departments), time slots, etc.

   NOT entities: dates, numeric values, IDs, boolean flags, notes/descriptions.

   A column is likely an entity if:
   - It has significantly fewer unique values than total rows (high repetition)
   - The values are proper nouns or categorical labels
   - Multiple numeric columns could be "about" this entity

   For staff_roster / client_roster files: the name column IS an entity (Person type) even if every value is unique, because the PURPOSE is to enumerate people.

   When choosing aggregation methods, think about what makes business sense:
   - Revenue, costs, sales → use 'sum' (totals make sense)
   - Rates, percentages, ratios → use 'average'
   - Counts of people, items, sessions → use 'sum' for totals, 'average' ONLY when per-unit
   - Be conservative with averages. If a column called 'attendance' has values like 30, 45, 50, those are likely per-session counts that should be SUMMED.
   - When creating property labels, make them precise: 'Total Revenue' not just 'Revenue'.

STEP 2 — PROPERTIES: For each entity, which numeric columns describe it?

STEP 3 — RELATIONSHIPS: If two entity columns appear in the same row, they have a relationship.

   IMPORTANT — Transaction role semantics:
   - If data has buyer/seller, payer/payee, from/to, sender/receiver columns, treat each role as a SEPARATE entity type
   - NEVER create a relationship where fromTypeSlug === toTypeSlug from the SAME column

STEP 4 — METRICS: Identify date columns, revenue columns, cost columns, attendance/volume columns.
   - For staff_roster / client_roster / schedule files: metrics.revenueColumns MAY be empty []. That's fine.
   - For transactions_sales: the "Total" column is the authoritative net amount paid.

STEP 5 — CLARIFYING QUESTION: If your overall confidence is below 0.5, include ONE simple clarifying question that a business user could answer in one sentence.

Be conservative. Only detect clear, obvious entity types. A column with 100 unique values out of 100 rows is NOT an entity — it's an identifier. Exception: roster files where the purpose IS the list of names.

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
  "streamType": "transactions_sales | staff_roster | client_roster | inventory | schedule | unknown",
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
    "dateColumn": "date_column_name_or_null",
    "revenueColumns": ["revenue_col_or_empty_array"],
    "costColumns": ["cost_col_or_empty_array"],
    "attendanceColumns": ["attendance_col_or_empty_array"],
    "utilizationColumns": []
  },
  "confidence": 0.85,
  "reasoning": "Brief explanation of what was detected and why",
  "clarifyingQuestion": "Only if confidence < 0.5: a single simple question"
}

streamType is REQUIRED. Pick the best match. Use "unknown" only as last resort.
For staff_roster files: revenueColumns=[], dateColumn=null is fine. Still detect entity types (Person).
clarifyingQuestion is optional — only include if confidence < 0.5.

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
  streamType: 'unknown',
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
