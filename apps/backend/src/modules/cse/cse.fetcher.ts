import fs from 'node:fs/promises';
import path from 'node:path';
import axios from 'axios';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { assertAlphabeticalSourceUrl } from './cse.sourceGuard';
import { FetchAlphabeticalResult, ParsedCseAlphabeticalRow } from './cse.types';

interface FetchAlphabeticalRowsOptions {
  runId: string;
  tradingDate: string;
}

interface PythonImportResponse {
  status: string;
  sourceUrl: string;
  fetchMode: string;
  fetchedAt?: string;
  rowCount: number;
  recordsBeforeDeduplication?: number;
  recordsDeduplicated?: number;
  checksum?: string;
  warnings?: string[];
  rows: ParsedCseAlphabeticalRow[];
}

function assertEnoughRows(rows: ParsedCseAlphabeticalRow[], warnings: string[]): void {
  if (rows.length >= env.CSE_IMPORT_MIN_EXPECTED_ROWS) return;
  const message = `CSE Python HTTP importer parsed only ${rows.length} unique rows; expected at least ${env.CSE_IMPORT_MIN_EXPECTED_ROWS}.`;
  warnings.push(message);
  throw new AppError(502, message);
}

function validatePythonImportResponse(value: unknown): PythonImportResponse {
  const response = value as Partial<PythonImportResponse>;
  if (!response || typeof response !== 'object') {
    throw new AppError(502, 'Python CSE importer returned an invalid response body.');
  }
  if (response.fetchMode !== 'python-http') {
    throw new AppError(502, `Python CSE importer returned unsupported mode: ${String(response.fetchMode)}`);
  }
  if (!Array.isArray(response.rows)) {
    throw new AppError(502, 'Python CSE importer response did not include a rows array.');
  }
  if (response.rows.length === 0) {
    throw new AppError(502, 'Python CSE importer parsed zero listed-company rows.');
  }
  return response as PythonImportResponse;
}

function pythonImporterErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (detail && typeof detail === 'object' && 'message' in detail) return String(detail.message);
    if (typeof detail === 'string') return detail;
    return error.message;
  }
  return error instanceof Error ? error.message : 'Unknown Python CSE importer error';
}

export async function fetchAlphabeticalRows(options: FetchAlphabeticalRowsOptions): Promise<FetchAlphabeticalResult> {
  assertAlphabeticalSourceUrl(env.CSE_IMPORT_SOURCE_URL);

  let response: PythonImportResponse;
  try {
    const { data } = await axios.post(
      `${env.PYTHON_WORKER_URL}/cse/import/alphabetical`,
      {
        runId: options.runId,
        tradingDate: options.tradingDate,
        sourceUrl: env.CSE_IMPORT_SOURCE_URL
      },
      {
        timeout: env.CSE_IMPORT_TIMEOUT_SECONDS * 1000
      }
    );
    response = validatePythonImportResponse(data);
  } catch (error) {
    throw new AppError(502, `CSE Python HTTP importer failed: ${pythonImporterErrorMessage(error)}`);
  }

  const warnings = [...(response.warnings ?? [])];
  assertEnoughRows(response.rows, warnings);

  const rawStoragePath = path.resolve(process.cwd(), env.CSE_IMPORT_RAW_STORAGE_DIR, options.tradingDate, options.runId);
  await fs.mkdir(rawStoragePath, { recursive: true });

  const rawContent = JSON.stringify(
    {
      source: 'CSE_LISTED_COMPANY_DIRECTORY_ALPHABETICAL',
      sourceUrl: response.sourceUrl,
      fetchMode: 'python-http',
      fetchedAt: response.fetchedAt,
      checksum: response.checksum,
      rawStoragePath,
      warnings,
      recordsBeforeDeduplication: response.recordsBeforeDeduplication ?? response.rows.length,
      recordsDeduplicated: response.recordsDeduplicated ?? 0,
      rows: response.rows
    },
    null,
    2
  );
  await fs.writeFile(path.join(rawStoragePath, 'merged-normalized.json'), rawContent, 'utf8');

  return {
    rows: response.rows,
    rawContent,
    fetchMode: 'python-http',
    sourceUrl: response.sourceUrl,
    warnings,
    rawStoragePath,
    downloadedFiles: [],
    lettersAttempted: 0,
    lettersSuccessful: 0,
    lettersFailed: 0,
    failedLetters: [],
    recordsBeforeDeduplication: response.recordsBeforeDeduplication ?? response.rows.length,
    recordsDeduplicated: response.recordsDeduplicated ?? 0
  };
}
