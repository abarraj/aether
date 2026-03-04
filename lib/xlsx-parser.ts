/**
 * XLSX parser: reads .xlsx / .xls files into the same
 * { headers, rows } shape that csv-parser produces.
 *
 * Auto-selects the most table-like sheet (highest consistent row × col density)
 * and records which sheet was chosen for traceability.
 */

import * as XLSX from 'xlsx';

export interface XlsxParseResult {
  headers: string[];
  rows: Record<string, unknown>[];
  /** Name of the sheet that was parsed. */
  sheetName: string;
}

/**
 * Score a sheet by how "table-like" it is: consistent column count × row count.
 */
function sheetTableScore(sheet: XLSX.WorkSheet): number {
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
  const cols = range.e.c - range.s.c + 1;
  const rows = range.e.r - range.s.r + 1;
  if (cols < 2 || rows < 2) return 0;
  return cols * rows;
}

/**
 * Parse an XLSX/XLS buffer into headers + rows.
 * Picks the sheet with the highest table density automatically.
 */
export function parseXlsx(buffer: Buffer): XlsxParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  if (workbook.SheetNames.length === 0) {
    return { headers: [], rows: [], sheetName: '' };
  }

  // Pick the most table-like sheet
  let bestSheet = workbook.SheetNames[0]!;
  let bestScore = 0;

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const score = sheetTableScore(sheet);
    if (score > bestScore) {
      bestScore = score;
      bestSheet = name;
    }
  }

  const sheet = workbook.Sheets[bestSheet];
  if (!sheet) return { headers: [], rows: [], sheetName: bestSheet };

  // Convert to JSON (first row = headers)
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
  });

  if (jsonRows.length === 0) {
    return { headers: [], rows: [], sheetName: bestSheet };
  }

  const headers = Object.keys(jsonRows[0]!);

  return {
    headers,
    rows: jsonRows,
    sheetName: bestSheet,
  };
}
