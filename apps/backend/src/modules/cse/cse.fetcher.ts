import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import axios from 'axios';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { assertAlphabeticalSourceUrl } from './cse.sourceGuard';
import { CseLetterArtifact, CseLetterFailure, FetchAlphabeticalResult, FetchTradeSummaryResult, ParsedCseAlphabeticalRow, ParsedCseTradeSummaryRow } from './cse.types';

interface FetchAlphabeticalRowsOptions {
  runId: string;
  tradingDate: string;
}

interface PythonLetterResult {
  letter: string;
  status: 'success' | 'failed' | 'empty';
  rowCount?: number;
  attempts?: number;
  error?: string | null;
  lastError?: string | null;
}

interface PythonRawLetterResponse {
  letter: string;
  statusCode?: number;
  payload?: unknown;
  rawText?: string;
}

interface PythonImportResponse {
  status: string;
  sourceUrl: string;
  fetchMode: string;
  fetchGranularity?: string;
  fullExportSupported?: boolean;
  browserAutomationEnabled?: boolean;
  fetchedAt?: string;
  rowCount: number;
  recordsBeforeDeduplication?: number;
  recordsDeduplicated?: number;
  duplicateSymbols?: string[];
  checksum?: string;
  warnings?: string[];
  lettersAttempted?: number;
  lettersSuccessful?: number;
  lettersFailed?: number;
  failedLetters?: CseLetterFailure[];
  letterResults?: PythonLetterResult[];
  rawLetterResponses?: PythonRawLetterResponse[];
  rows: ParsedCseAlphabeticalRow[];
}

function checksum(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function validatePythonImportResponse(value: unknown): PythonImportResponse {
  const response = value as Partial<PythonImportResponse>;
  if (!response || typeof response !== 'object') {
    throw new AppError(502, 'Python CSE importer returned an invalid response body.');
  }
  if (response.fetchMode !== 'python-http') {
    throw new AppError(502, `Python CSE importer returned unsupported mode: ${String(response.fetchMode)}`);
  }
  if (response.fullExportSupported === true) {
    throw new AppError(502, 'Python CSE importer attempted to use a full export path, but only A-Z letter-by-letter import is allowed.');
  }
  if (response.browserAutomationEnabled === true) {
    throw new AppError(502, 'Python CSE importer reported browser automation enabled, but browser automation is not allowed for this project.');
  }
  if (!Array.isArray(response.rows)) {
    throw new AppError(502, 'Python CSE importer response did not include a rows array.');
  }
  if (!Array.isArray(response.letterResults) || response.letterResults.length !== 26) {
    throw new AppError(502, 'Python CSE importer did not return all 26 A-Z letter results.');
  }
  if (!Array.isArray(response.rawLetterResponses) || response.rawLetterResponses.length !== 26) {
    throw new AppError(502, 'Python CSE importer did not return all 26 raw A-Z letter responses.');
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

async function writeJsonArtifact(filePath: string, value: unknown): Promise<{ checksum: string; sizeBytes: number }> {
  const content = JSON.stringify(value, null, 2);
  await fs.writeFile(filePath, content, 'utf8');
  return { checksum: checksum(content), sizeBytes: Buffer.byteLength(content) };
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
        timeout: env.CSE_IMPORT_JOB_TIMEOUT_SECONDS * 1000
      }
    );
    response = validatePythonImportResponse(data);
  } catch (error) {
    throw new AppError(502, `CSE Python HTTP importer failed: ${pythonImporterErrorMessage(error)}`);
  }

  const warnings = [...(response.warnings ?? [])];
  const rawStoragePath = path.resolve(process.cwd(), env.CSE_IMPORT_ARTIFACT_STORAGE_DIR || env.CSE_IMPORT_RAW_STORAGE_DIR, options.tradingDate, options.runId);
  const rawDir = path.join(rawStoragePath, 'raw');
  const normalizedDir = path.join(rawStoragePath, 'normalized');
  const reportsDir = path.join(rawStoragePath, 'reports');
  await fs.mkdir(rawDir, { recursive: true });
  await fs.mkdir(normalizedDir, { recursive: true });
  await fs.mkdir(reportsDir, { recursive: true });

  const rawArtifacts: CseLetterArtifact[] = [];
  for (const rawResponse of response.rawLetterResponses ?? []) {
    const letter = rawResponse.letter;
    const result = response.letterResults?.find((item) => item.letter === letter);
    const filePath = path.join(rawDir, `${letter}.json`);
    const artifact = await writeJsonArtifact(filePath, rawResponse);
    rawArtifacts.push({
      letter,
      filePath,
      suggestedFilename: `${letter}.json`,
      contentType: 'application/json',
      checksum: artifact.checksum,
      rowCount: result?.rowCount ?? 0,
      status: result?.status === 'failed' ? 'failed' : (result?.rowCount ?? 0) > 0 ? 'success' : 'empty',
      attempts: result?.attempts ?? null,
      lastError: result?.lastError ?? result?.error ?? null
    });
  }

  const rawContentObject = {
    source: 'CSE_LISTED_COMPANY_DIRECTORY_ALPHABETICAL',
    sourceUrl: response.sourceUrl,
    fetchMode: 'python-http',
    fetchGranularity: 'A_Z_LETTER_BY_LETTER',
    fullExportSupported: false,
    browserAutomationEnabled: false,
    fetchedAt: response.fetchedAt,
    checksum: response.checksum,
    rawStoragePath,
    warnings,
    lettersAttempted: response.lettersAttempted ?? response.letterResults?.length ?? 0,
    lettersSuccessful: response.lettersSuccessful ?? response.letterResults?.filter((item) => item.status === 'success' || item.status === 'empty').length ?? 0,
    lettersFailed: response.lettersFailed ?? response.letterResults?.filter((item) => item.status === 'failed').length ?? 0,
    failedLetters: (response.failedLetters ?? []).map((item) => ({ letter: item.letter, error: item.error, attempts: item.attempts })),
    recordsBeforeDeduplication: response.recordsBeforeDeduplication ?? response.rows.length,
    recordsDeduplicated: response.recordsDeduplicated ?? 0,
    duplicateSymbols: response.duplicateSymbols ?? [],
    letterResults: (response.letterResults ?? []).map((item) => ({
      letter: item.letter,
      status: item.status === 'failed' ? 'failed' : (item.rowCount ?? 0) > 0 ? 'success' : 'empty',
      rowCount: item.rowCount ?? 0,
      attempts: item.attempts ?? null,
      error: item.lastError ?? item.error ?? null
    })),
    rawArtifacts,
    rows: response.rows
  };
  const rawContent = JSON.stringify(rawContentObject, null, 2);
  await fs.writeFile(path.join(normalizedDir, 'merged-normalized.json'), rawContent, 'utf8');
  await writeJsonArtifact(path.join(reportsDir, 'import-report.json'), {
    runId: options.runId,
    tradingDate: options.tradingDate,
    createdAt: new Date().toISOString(),
    ...rawContentObject,
    rows: undefined
  });

  return {
    rows: response.rows,
    rawContent,
    fetchMode: 'python-http',
    sourceUrl: response.sourceUrl,
    warnings,
    rawStoragePath,
    downloadedFiles: rawArtifacts.map((artifact) => ({
      letter: artifact.letter,
      filePath: artifact.filePath,
      suggestedFilename: artifact.suggestedFilename,
      contentType: artifact.contentType
    })),
    rawArtifacts,
    letterResults: (response.letterResults ?? []).map((item) => ({
      letter: item.letter,
      status: item.status === 'failed' ? 'failed' : (item.rowCount ?? 0) > 0 ? 'success' : 'empty',
      rowCount: item.rowCount ?? 0,
      attempts: item.attempts ?? null,
      error: item.lastError ?? item.error ?? null
    })),
    lettersAttempted: response.lettersAttempted ?? response.letterResults?.length ?? 0,
    lettersSuccessful: response.lettersSuccessful ?? response.letterResults?.filter((item) => item.status === 'success' || item.status === 'empty').length ?? 0,
    lettersFailed: response.lettersFailed ?? response.letterResults?.filter((item) => item.status === 'failed').length ?? 0,
    failedLetters: (response.failedLetters ?? []).map((item) => ({ letter: item.letter, error: item.error, attempts: item.attempts })),
    recordsBeforeDeduplication: response.recordsBeforeDeduplication ?? response.rows.length,
    recordsDeduplicated: response.recordsDeduplicated ?? 0,
    duplicateSymbols: response.duplicateSymbols ?? []
  };
}
interface PythonTradeSummaryResponse {
  status: string;
  sourceUrl: string;
  fetchMode: string;
  fetchStrategy?: string;
  fetchedAt?: string;
  marketTimestamp?: string | null;
  sourceMarketTimestampText?: string | null;
  rowCount: number;
  recordsBeforeDeduplication?: number;
  recordsDeduplicated?: number;
  duplicateSymbols?: string[];
  checksum?: string;
  warnings?: string[];
  rawResponse?: unknown;
  rows: ParsedCseTradeSummaryRow[];
}

function assertTradeSummarySourceUrl(sourceUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new AppError(400, 'Invalid CSE Trade Summary source URL');
  }
  if (parsed.hostname !== 'www.cse.lk' && parsed.hostname !== 'cse.lk') {
    throw new AppError(400, 'Only cse.lk source URLs are allowed for the Trade Summary importer');
  }
  if (!parsed.pathname.includes('/equity/trade-summary')) {
    throw new AppError(400, 'Only the CSE equity/trade-summary source path is allowed for this importer');
  }
}

function validatePythonTradeSummaryResponse(value: unknown): PythonTradeSummaryResponse {
  const response = value as Partial<PythonTradeSummaryResponse>;
  if (!response || typeof response !== 'object') {
    throw new AppError(502, 'Python CSE Trade Summary importer returned an invalid response body.');
  }
  if (response.fetchMode !== 'python-http') {
    throw new AppError(502, `Python CSE Trade Summary importer returned unsupported mode: ${String(response.fetchMode)}`);
  }
  if (!Array.isArray(response.rows)) {
    throw new AppError(502, 'Python CSE Trade Summary importer response did not include a rows array.');
  }
  if (response.rows.length === 0) {
    throw new AppError(502, 'Python CSE Trade Summary importer returned zero rows.');
  }
  return response as PythonTradeSummaryResponse;
}

export async function fetchTradeSummaryRows(options: FetchAlphabeticalRowsOptions): Promise<FetchTradeSummaryResult> {
  assertTradeSummarySourceUrl(env.CSE_TRADE_SUMMARY_SOURCE_URL);

  let response: PythonTradeSummaryResponse;
  try {
    const { data } = await axios.post(
      `${env.PYTHON_WORKER_URL}/cse/import/trade-summary`,
      {
        runId: options.runId,
        tradingDate: options.tradingDate,
        sourceUrl: env.CSE_TRADE_SUMMARY_SOURCE_URL
      },
      {
        timeout: env.CSE_TRADE_SUMMARY_TIMEOUT_SECONDS * 1000
      }
    );
    response = validatePythonTradeSummaryResponse(data);
  } catch (error) {
    throw new AppError(502, `CSE Trade Summary Python HTTP importer failed: ${pythonImporterErrorMessage(error)}`);
  }

  const warnings = [...(response.warnings ?? [])];
  if (response.rows.length < env.CSE_TRADE_SUMMARY_MIN_EXPECTED_ROWS) {
    warnings.push(`Trade Summary row count ${response.rows.length} is below configured minimum ${env.CSE_TRADE_SUMMARY_MIN_EXPECTED_ROWS}.`);
  }

  const rawStoragePath = path.resolve(process.cwd(), env.CSE_TRADE_SUMMARY_ARTIFACT_STORAGE_DIR, options.tradingDate, options.runId);
  const rawDir = path.join(rawStoragePath, 'raw');
  const normalizedDir = path.join(rawStoragePath, 'normalized');
  const reportsDir = path.join(rawStoragePath, 'reports');
  await fs.mkdir(rawDir, { recursive: true });
  await fs.mkdir(normalizedDir, { recursive: true });
  await fs.mkdir(reportsDir, { recursive: true });

  const rawArtifactPath = path.join(rawDir, 'trade-summary-raw-response.json');
  const rawArtifact = await writeJsonArtifact(rawArtifactPath, {
    source: 'CSE_TRADE_SUMMARY',
    sourceUrl: response.sourceUrl,
    fetchMode: response.fetchMode,
    fetchStrategy: response.fetchStrategy,
    fetchedAt: response.fetchedAt,
    marketTimestamp: response.marketTimestamp ?? null,
    sourceMarketTimestampText: response.sourceMarketTimestampText ?? null,
    checksum: response.checksum,
    warnings,
    rawResponse: response.rawResponse ?? null
  });

  const rawContentObject = {
    source: 'CSE_TRADE_SUMMARY',
    sourceUrl: response.sourceUrl,
    fetchMode: 'python-http',
    fetchStrategy: response.fetchStrategy ?? 'api',
    fetchedAt: response.fetchedAt,
    checksum: response.checksum ?? rawArtifact.checksum,
    rawStoragePath,
    rawArtifactPath,
    warnings,
    marketTimestamp: response.marketTimestamp ?? null,
    sourceMarketTimestampText: response.sourceMarketTimestampText ?? null,
    recordsBeforeDeduplication: response.recordsBeforeDeduplication ?? response.rows.length,
    recordsDeduplicated: response.recordsDeduplicated ?? 0,
    duplicateSymbols: response.duplicateSymbols ?? [],
    rows: response.rows
  };
  const rawContent = JSON.stringify(rawContentObject, null, 2);
  await fs.writeFile(path.join(normalizedDir, 'trade-summary-normalized.json'), rawContent, 'utf8');
  await writeJsonArtifact(path.join(reportsDir, 'trade-summary-import-report.json'), {
    runId: options.runId,
    tradingDate: options.tradingDate,
    createdAt: new Date().toISOString(),
    ...rawContentObject,
    rows: undefined
  });

  return {
    rows: response.rows,
    rawContent,
    fetchMode: 'python-http',
    fetchStrategy: response.fetchStrategy ?? 'api',
    sourceUrl: response.sourceUrl,
    warnings,
    rawStoragePath,
    rawArtifactPath,
    checksum: response.checksum ?? rawArtifact.checksum,
    marketTimestamp: response.marketTimestamp ?? null,
    sourceMarketTimestampText: response.sourceMarketTimestampText ?? null,
    recordsBeforeDeduplication: response.recordsBeforeDeduplication ?? response.rows.length,
    recordsDeduplicated: response.recordsDeduplicated ?? 0,
    duplicateSymbols: response.duplicateSymbols ?? []
  };
}

