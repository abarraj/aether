// Lightweight CSV parser for Aether uploads with quoted field and delimiter detection.

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Split a CSV line respecting quoted fields. Handles:
 * - Fields wrapped in double quotes: "hello, world"
 * - Escaped quotes within fields: "say ""hello"""
 * - Newlines within quoted fields are not supported (lines are pre-split)
 */
function splitLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        current += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === delimiter) {
        fields.push(current.trim());
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
  }

  fields.push(current.trim());
  return fields;
}

function detectDelimiter(sampleLine: string): string {
  const candidates: string[] = [',', '\t', ';'];
  let bestDelimiter = ',';
  let bestCount = -1;

  for (const delimiter of candidates) {
    // Count fields respecting quoted strings
    const count = splitLine(sampleLine, delimiter).length;
    if (count > bestCount) {
      bestCount = count;
      bestDelimiter = delimiter;
    }
  }

  return bestDelimiter;
}

export function parseCsv(text: string): ParsedCsv {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const nonEmptyLines = lines.filter((line) => line.length > 0);

  if (nonEmptyLines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headerLine = nonEmptyLines[0];
  const delimiter = detectDelimiter(headerLine);
  const headers = splitLine(headerLine, delimiter);

  const rows: Record<string, string>[] = [];

  for (let index = 1; index < nonEmptyLines.length; index += 1) {
    const line = nonEmptyLines[index];
    if (!line) continue;

    const values = splitLine(line, delimiter);
    const record: Record<string, string> = {};

    headers.forEach((header, headerIndex) => {
      const rawValue = values[headerIndex] ?? '';
      record[header] = rawValue;
    });

    const hasNonEmpty = Object.values(record).some((value) => value !== '');
    if (hasNonEmpty) {
      rows.push(record);
    }
  }

  return { headers, rows };
}
