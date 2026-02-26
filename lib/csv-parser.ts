// Lightweight CSV parser for Aether uploads with basic delimiter detection.

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

function detectDelimiter(sampleLine: string): string {
  const candidates: string[] = [',', '\t', ';'];
  let bestDelimiter = ',';
  let bestCount = -1;

  for (const delimiter of candidates) {
    const count = sampleLine.split(delimiter).length;
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
  const headers = headerLine.split(delimiter).map((header) => header.trim());

  const rows: Record<string, string>[] = [];

  for (let index = 1; index < nonEmptyLines.length; index += 1) {
    const line = nonEmptyLines[index];
    if (!line) continue;

    const values = line.split(delimiter);
    const record: Record<string, string> = {};

    headers.forEach((header, headerIndex) => {
      const rawValue = values[headerIndex] ?? '';
      record[header] = rawValue.trim();
    });

    const hasNonEmpty = Object.values(record).some((value) => value !== '');
    if (hasNonEmpty) {
      rows.push(record);
    }
  }

  return { headers, rows };
}

