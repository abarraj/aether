// Synonym expansion for entity name deduplication.
// Maps common abbreviations and variants to canonical forms so that
// "NYC" matches "New York City", "St." matches "Saint", etc.

const SYNONYM_MAP: [RegExp, string][] = [
  // Location abbreviations
  [/\bnyc\b/i, 'new york city'],
  [/\bla\b/i, 'los angeles'],
  [/\bsf\b/i, 'san francisco'],
  [/\bdc\b/i, 'washington dc'],
  [/\bchi\b/i, 'chicago'],
  [/\batl\b/i, 'atlanta'],
  [/\bdfw\b/i, 'dallas fort worth'],

  // Common prefix abbreviations
  [/\bst\.\s*/i, 'saint '],
  [/\bmt\.\s*/i, 'mount '],
  [/\bft\.\s*/i, 'fort '],
  [/\bdr\.\s*/i, 'doctor '],

  // Directional
  [/\bn\.\s*/i, 'north '],
  [/\bs\.\s*/i, 'south '],
  [/\be\.\s*/i, 'east '],
  [/\bw\.\s*/i, 'west '],
  [/\bnw\b/i, 'northwest'],
  [/\bne\b/i, 'northeast'],
  [/\bsw\b/i, 'southwest'],
  [/\bse\b/i, 'southeast'],

  // Business abbreviations
  [/\binc\.\s*$/i, 'incorporated'],
  [/\bllc\s*$/i, ''],
  [/\bcorp\.\s*$/i, 'corporation'],
  [/\bco\.\s*$/i, 'company'],
  [/\b&\b/g, 'and'],
];

/**
 * Normalize an entity name for deduplication matching.
 * Expands known abbreviations and strips punctuation differences.
 */
export function normalizeEntityName(name: string): string {
  let normalized = name.trim().toLowerCase();

  // Apply synonym expansions
  for (const [pattern, replacement] of SYNONYM_MAP) {
    normalized = normalized.replace(pattern, replacement);
  }

  // Collapse whitespace and strip trailing punctuation
  normalized = normalized
    .replace(/[''`]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/g, '')
    .trim();

  return normalized;
}

/**
 * Check if two entity names are likely the same entity.
 * Uses normalized form comparison.
 */
export function areEntityNamesEquivalent(a: string, b: string): boolean {
  return normalizeEntityName(a) === normalizeEntityName(b);
}
