import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../middleware/errorHandler';
import { dedupeRows, parseAlphabeticalCsv } from './cse.parser';
import { ParsedCseAlphabeticalRow } from './cse.types';

function isLikelyText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 512));
  if (sample.includes(0)) return false;
  const text = sample.toString('utf8');
  return /Company|Symbol|Price|Turnover|Volume|,/i.test(text);
}

async function loadXlsxRows(buffer: Buffer, filePath: string): Promise<ParsedCseAlphabeticalRow[]> {
  let xlsx: any;
  try {
    xlsx = await Function('return import("xlsx")')();
  } catch {
    throw new AppError(
      500,
      `CSE downloaded file appears to be Excel (${path.basename(filePath)}), but the xlsx package is not installed. Run npm install in apps/backend.`
    );
  }

  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames?.[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const csv = xlsx.utils.sheet_to_csv(sheet, { blankrows: false });
  return parseAlphabeticalCsv(csv);
}

export async function parseAlphabeticalExportFile(filePath: string, sourceLetter: string): Promise<ParsedCseAlphabeticalRow[]> {
  const buffer = await fs.readFile(filePath);
  const extension = path.extname(filePath).toLowerCase();
  let rows: ParsedCseAlphabeticalRow[];

  if (['.csv', '.txt'].includes(extension) || isLikelyText(buffer)) {
    rows = parseAlphabeticalCsv(buffer.toString('utf8'));
  } else if (['.xlsx', '.xls'].includes(extension)) {
    rows = await loadXlsxRows(buffer, filePath);
  } else {
    try {
      rows = parseAlphabeticalCsv(buffer.toString('utf8'));
      if (rows.length === 0) rows = await loadXlsxRows(buffer, filePath);
    } catch {
      rows = await loadXlsxRows(buffer, filePath);
    }
  }

  return rows.map((row) => ({
    ...row,
    sourceLetter,
    rawRow: {
      ...row.rawRow,
      sourceLetter,
      sourceFile: path.basename(filePath)
    }
  }));
}

export function mergeAndDedupeAlphabeticalRows(rows: ParsedCseAlphabeticalRow[]): {
  rows: ParsedCseAlphabeticalRow[];
  recordsBeforeDeduplication: number;
  recordsDeduplicated: number;
} {
  const recordsBeforeDeduplication = rows.length;
  const deduped = dedupeRows(rows);
  return {
    rows: deduped,
    recordsBeforeDeduplication,
    recordsDeduplicated: Math.max(recordsBeforeDeduplication - deduped.length, 0)
  };
}
