import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import axios from 'axios';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { assertAlphabeticalSourceUrl, assertDailyMarketSummarySourceUrl, assertGicsClassificationSourceUrl, assertGicsIndicesSourceUrl, assertGicsSummarySourceUrl } from './cse.sourceGuard';
import { CseGicsValidationReport, CseLetterArtifact, CseLetterFailure, FetchAlphabeticalResult, FetchDailyMarketSummaryResult, FetchGicsResult, FetchTradeSummaryResult, ParsedCseAlphabeticalRow, ParsedCseGicsClassificationRow, ParsedCseGicsIndexRow, ParsedCseGicsIndustryGroupRow, ParsedCseGicsSummaryRow, ParsedCseTradeSummaryRow } from './cse.types';

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


interface PythonGicsResponse {
  status: string;
  source: string;
  fetchMode: string;
  browserAutomationEnabled?: boolean;
  fetchedAt?: string;
  summaryUrl: string;
  indicesUrl: string;
  classificationUrl: string;
  checksum?: string;
  summary: { fetchMode?: string; rowCount: number; rows: ParsedCseGicsSummaryRow[]; industryGroups?: ParsedCseGicsIndustryGroupRow[] };
  indices: { fetchMode?: string; rowCount: number; rows: ParsedCseGicsIndexRow[] };
  classification: {
    groupsAttempted: number;
    groupsSuccessful: number;
    groupsFailed: number;
    groupFailures?: Array<{ industryGroupName: string; error: string }>;
    rowCount: number;
    recordsBeforeDeduplication?: number;
    recordsDeduplicated?: number;
    duplicateSymbols?: string[];
    fetchMode?: string;
    groupFetchReport?: Array<{ industryGroupName: string; fetchMode?: string; rowCount: number; status: string; error?: string; attemptedUrls?: string[] }>;
    rows: ParsedCseGicsClassificationRow[];
  };
  warnings?: string[];
  rawResponses?: {
    downloadDiscoveryReport?: unknown;
    groupFetchReport?: unknown;
    [key: string]: unknown;
  };
}

function validatePythonGicsResponse(value: unknown): PythonGicsResponse {
  const response = value as Partial<PythonGicsResponse>;
  if (!response || typeof response !== 'object') {
    throw new AppError(502, 'Python CSE GICS importer returned an invalid response body.');
  }
  if (response.fetchMode !== 'python-http') {
    throw new AppError(502, `Python CSE GICS importer returned unsupported mode: ${String(response.fetchMode)}`);
  }
  if (response.browserAutomationEnabled === true) {
    throw new AppError(502, 'Python CSE GICS importer reported browser automation enabled, but browser automation is not allowed for this project.');
  }
  if (!response.summary || !Array.isArray(response.summary.rows)) {
    throw new AppError(502, 'Python CSE GICS importer response did not include summary rows.');
  }
  if (!response.indices || !Array.isArray(response.indices.rows)) {
    throw new AppError(502, 'Python CSE GICS importer response did not include index rows.');
  }
  if (!response.classification || !Array.isArray(response.classification.rows)) {
    throw new AppError(502, 'Python CSE GICS importer response did not include classification rows.');
  }
  return response as PythonGicsResponse;
}

function buildGicsValidationReport(response: PythonGicsResponse, warnings: string[]): CseGicsValidationReport {
  const errors: string[] = [];
  const minExpectedGroups = env.CSE_GICS_MIN_EXPECTED_GROUPS;
  const minExpectedClassificationRows = env.CSE_GICS_MIN_EXPECTED_CLASSIFICATION_ROWS;
  const industryGroupCount = response.summary.industryGroups?.length ?? 0;
  const summaryRowCount = response.summary.rows.length;
  const indicesRowCount = response.indices.rows.length;
  const classificationRowCount = response.classification.rows.length;

  if (summaryRowCount === 0) errors.push('GICS Summary returned zero rows.');
  if (industryGroupCount === 0) errors.push('GICS Summary industry-group mapping returned zero rows.');
  if (indicesRowCount === 0) errors.push('GICS Indices returned zero rows.');
  if (classificationRowCount === 0) errors.push('GICS Classification returned zero rows.');
  if (response.classification.groupsAttempted < minExpectedGroups) {
    errors.push(`GICS Classification attempted ${response.classification.groupsAttempted} groups, below required ${minExpectedGroups}.`);
  }
  if (classificationRowCount < minExpectedClassificationRows) {
    errors.push(`GICS Classification row count ${classificationRowCount} is below required ${minExpectedClassificationRows}.`);
  }
  if (response.classification.groupsSuccessful < Math.max(1, minExpectedGroups - 2)) {
    errors.push(`GICS Classification succeeded for ${response.classification.groupsSuccessful} groups, below required ${Math.max(1, minExpectedGroups - 2)}.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summaryRowCount,
    industryGroupCount,
    indicesRowCount,
    classificationRowCount,
    groupsAttempted: response.classification.groupsAttempted,
    groupsSuccessful: response.classification.groupsSuccessful,
    groupsFailed: response.classification.groupsFailed,
    duplicateSymbols: response.classification.duplicateSymbols ?? [],
    thresholds: { minExpectedGroups, minExpectedClassificationRows },
    promotionAllowed: errors.length === 0
  };
}

export async function fetchGicsRows(options: FetchAlphabeticalRowsOptions): Promise<FetchGicsResult> {
  assertGicsSummarySourceUrl(env.CSE_GICS_SUMMARY_SOURCE_URL);
  assertGicsIndicesSourceUrl(env.CSE_GICS_INDICES_SOURCE_URL);
  assertGicsClassificationSourceUrl(env.CSE_GICS_CLASSIFICATION_SOURCE_URL);

  let response: PythonGicsResponse;
  try {
    const { data } = await axios.post(
      `${env.PYTHON_WORKER_URL}/cse/import/gics`,
      {
        runId: options.runId,
        tradingDate: options.tradingDate,
        summaryUrl: env.CSE_GICS_SUMMARY_SOURCE_URL,
        indicesUrl: env.CSE_GICS_INDICES_SOURCE_URL,
        classificationUrl: env.CSE_GICS_CLASSIFICATION_SOURCE_URL
      },
      { timeout: env.CSE_GICS_TIMEOUT_SECONDS * 1000 }
    );
    response = validatePythonGicsResponse(data);
  } catch (error) {
    throw new AppError(502, `CSE GICS Python HTTP importer failed: ${pythonImporterErrorMessage(error)}`);
  }

  const warnings = [...(response.warnings ?? [])];
  const validationReport = buildGicsValidationReport(response, warnings);
  const rawStoragePath = path.resolve(process.cwd(), env.CSE_GICS_ARTIFACT_STORAGE_DIR, options.tradingDate, options.runId);
  const rawDir = path.join(rawStoragePath, 'raw');
  const normalizedDir = path.join(rawStoragePath, 'normalized');
  const reportsDir = path.join(rawStoragePath, 'reports');
  await fs.mkdir(rawDir, { recursive: true });
  await fs.mkdir(normalizedDir, { recursive: true });
  await fs.mkdir(reportsDir, { recursive: true });

  const summaryRawPath = path.join(rawDir, 'gics-summary-raw-response.json');
  const indicesRawPath = path.join(rawDir, 'gics-indices-raw-response.json');
  const classificationRawPath = path.join(rawDir, 'gics-classification-raw-response.json');
  await writeJsonArtifact(summaryRawPath, { source: 'CSE_GICS_SUMMARY', sourceUrl: response.summaryUrl, rows: response.summary.rows, industryGroups: response.summary.industryGroups ?? [] });
  await writeJsonArtifact(indicesRawPath, { source: 'CSE_GICS_INDICES', sourceUrl: response.indicesUrl, rows: response.indices.rows });
  await writeJsonArtifact(classificationRawPath, { source: 'CSE_GICS_CLASSIFICATION', sourceUrl: response.classificationUrl, ...response.classification });
  await writeJsonArtifact(path.join(reportsDir, 'gics-validation-report.json'), validationReport);
  await writeJsonArtifact(path.join(reportsDir, 'gics-download-discovery-report.json'), response.rawResponses?.downloadDiscoveryReport ?? {});
  await writeJsonArtifact(path.join(reportsDir, 'gics-group-fetch-report.json'), response.rawResponses?.groupFetchReport ?? response.classification.groupFetchReport ?? []);

  const summaryNormalizedPath = path.join(normalizedDir, 'gics-summary-normalized.json');
  const indicesNormalizedPath = path.join(normalizedDir, 'gics-indices-normalized.json');
  const classificationNormalizedPath = path.join(normalizedDir, 'gics-classification-normalized.json');
  await writeJsonArtifact(summaryNormalizedPath, response.summary.rows);
  await writeJsonArtifact(indicesNormalizedPath, response.indices.rows);
  await writeJsonArtifact(classificationNormalizedPath, response.classification.rows);

  const importReportPath = path.join(reportsDir, 'gics-import-report.json');
  const rawContentObject = {
    source: 'CSE_GICS',
    fetchMode: 'python-http',
    browserAutomationEnabled: false,
    fetchedAt: response.fetchedAt,
    checksum: response.checksum,
    rawStoragePath,
    warnings,
    validationReport,
    summaryRowCount: response.summary.rows.length,
    industryGroupCount: response.summary.industryGroups?.length ?? 0,
    indicesRowCount: response.indices.rows.length,
    classificationRowCount: response.classification.rows.length,
    groupsAttempted: response.classification.groupsAttempted,
    groupsSuccessful: response.classification.groupsSuccessful,
    groupsFailed: response.classification.groupsFailed,
    recordsBeforeDeduplication: response.classification.recordsBeforeDeduplication ?? response.classification.rows.length,
    recordsDeduplicated: response.classification.recordsDeduplicated ?? 0,
    duplicateSymbols: response.classification.duplicateSymbols ?? [],
    groupFailures: response.classification.groupFailures ?? [],
    datasetFetchModes: {
      summary: response.summary.fetchMode ?? 'unknown',
      indices: response.indices.fetchMode ?? 'unknown',
      classification: response.classification.fetchMode ?? 'unknown'
    },
    rawResponses: response.rawResponses ?? {}
  };
  await writeJsonArtifact(importReportPath, { runId: options.runId, tradingDate: options.tradingDate, createdAt: new Date().toISOString(), ...rawContentObject });
  const rawContent = JSON.stringify(rawContentObject, null, 2);

  return {
    sourceUrl: response.classificationUrl,
    summaryUrl: response.summaryUrl,
    indicesUrl: response.indicesUrl,
    classificationUrl: response.classificationUrl,
    fetchMode: 'python-http',
    warnings,
    rawContent,
    rawStoragePath,
    rawArtifactPaths: {
      summaryRaw: summaryRawPath,
      indicesRaw: indicesRawPath,
      classificationRaw: classificationRawPath,
      summaryNormalized: summaryNormalizedPath,
      indicesNormalized: indicesNormalizedPath,
      classificationNormalized: classificationNormalizedPath,
      importReport: importReportPath
    },
    summaryRows: response.summary.rows,
    industryGroups: response.summary.industryGroups ?? [],
    indexRows: response.indices.rows,
    classificationRows: response.classification.rows,
    groupsAttempted: response.classification.groupsAttempted,
    groupsSuccessful: response.classification.groupsSuccessful,
    groupsFailed: response.classification.groupsFailed,
    groupFailures: response.classification.groupFailures ?? [],
    recordsBeforeDeduplication: response.classification.recordsBeforeDeduplication ?? response.classification.rows.length,
    recordsDeduplicated: response.classification.recordsDeduplicated ?? 0,
    duplicateSymbols: response.classification.duplicateSymbols ?? [],
    validationReport
  };
}

interface PythonDailyMarketSummaryResponse {
  status: string;
  source?: string;
  sourceUrl: string;
  fetchMode: string;
  fetchStrategy?: string;
  activeFetchStrategy?: string | null;
  fetchedAt?: string;
  tradingDate?: string | null;
  sourceAsOfText?: string | null;
  rowCount?: number;
  checksum?: string | null;
  warnings?: string[];
  validationReport?: FetchDailyMarketSummaryResult['validationReport'];
  rawPayload?: Record<string, unknown>;
  summary?: Record<string, number | string | null | undefined>;
}

function validatePythonDailyMarketSummaryResponse(value: unknown): PythonDailyMarketSummaryResponse {
  const response = value as Partial<PythonDailyMarketSummaryResponse>;
  if (!response || typeof response !== 'object') {
    throw new AppError(502, 'Python CSE Daily Market Summary importer returned an invalid response body.');
  }
  if (response.fetchMode !== 'python-http') {
    throw new AppError(502, `Python CSE Daily Market Summary importer returned unsupported mode: ${String(response.fetchMode)}`);
  }
  if (!response.summary || typeof response.summary !== 'object') {
    throw new AppError(502, 'Python CSE Daily Market Summary importer response did not include a summary object.');
  }
  if (!response.tradingDate && typeof response.summary.tradingDate !== 'string') {
    throw new AppError(502, 'Python CSE Daily Market Summary importer response did not include a trading date.');
  }
  const validation = response.validationReport;
  if (!validation || validation.valid !== true) {
    const errors = validation?.errors?.join(' | ') || 'unknown validation error';
    throw new AppError(502, `Python CSE Daily Market Summary validation failed: ${errors}`);
  }
  return response as PythonDailyMarketSummaryResponse;
}

export async function fetchDailyMarketSummary(options: FetchAlphabeticalRowsOptions): Promise<FetchDailyMarketSummaryResult> {
  assertDailyMarketSummarySourceUrl(env.CSE_DAILY_MARKET_SUMMARY_SOURCE_URL);

  let response: PythonDailyMarketSummaryResponse;
  try {
    const { data } = await axios.post(
      `${env.PYTHON_WORKER_URL}/cse/import/daily-market-summary`,
      {
        runId: options.runId,
        tradingDate: options.tradingDate,
        sourceUrl: env.CSE_DAILY_MARKET_SUMMARY_SOURCE_URL
      },
      { timeout: env.CSE_DAILY_MARKET_SUMMARY_TIMEOUT_SECONDS * 1000 }
    );
    response = validatePythonDailyMarketSummaryResponse(data);
  } catch (error) {
    throw new AppError(502, `CSE Daily Market Summary Python HTTP importer failed: ${pythonImporterErrorMessage(error)}`);
  }

  const tradingDate = String(response.tradingDate || response.summary?.tradingDate || options.tradingDate);
  const warnings = [...(response.warnings ?? [])];
  const rawStoragePath = path.resolve(process.cwd(), env.CSE_DAILY_MARKET_SUMMARY_ARTIFACT_STORAGE_DIR, tradingDate, options.runId);
  const rawDir = path.join(rawStoragePath, 'raw');
  const normalizedDir = path.join(rawStoragePath, 'normalized');
  const reportsDir = path.join(rawStoragePath, 'reports');
  await fs.mkdir(rawDir, { recursive: true });
  await fs.mkdir(normalizedDir, { recursive: true });
  await fs.mkdir(reportsDir, { recursive: true });

  const rawArtifactPath = path.join(rawDir, 'daily-market-summary-raw-response.json');
  const normalizedArtifactPath = path.join(normalizedDir, 'daily-market-summary-normalized.json');
  const validationArtifactPath = path.join(reportsDir, 'daily-market-summary-validation-report.json');

  const rawPayload = response.rawPayload ?? {};
  const validationReport = response.validationReport as FetchDailyMarketSummaryResult['validationReport'];
  await writeJsonArtifact(rawArtifactPath, {
    source: 'CSE_DAILY_MARKET_SUMMARY',
    sourceUrl: response.sourceUrl,
    fetchMode: 'python-http',
    fetchStrategy: response.fetchStrategy ?? 'api-first-html-fallback',
    activeFetchStrategy: response.activeFetchStrategy ?? null,
    fetchedAt: response.fetchedAt,
    checksum: response.checksum ?? null,
    rawPayload
  });
  await writeJsonArtifact(normalizedArtifactPath, {
    tradingDate,
    sourceAsOfText: response.sourceAsOfText ?? response.summary?.sourceAsOfText ?? null,
    summary: response.summary,
    warnings,
    validationReport
  });
  await writeJsonArtifact(validationArtifactPath, validationReport);

  return {
    sourceUrl: response.sourceUrl,
    fetchMode: 'python-http',
    fetchStrategy: response.fetchStrategy ?? 'api-first-html-fallback',
    activeFetchStrategy: response.activeFetchStrategy ?? null,
    tradingDate,
    sourceAsOfText: response.sourceAsOfText ?? (response.summary?.sourceAsOfText as string | null | undefined) ?? null,
    checksum: response.checksum ?? null,
    warnings,
    validationReport,
    rawPayload,
    summary: response.summary ?? {},
    rawStoragePath,
    rawArtifactPath,
    normalizedArtifactPath,
    validationArtifactPath
  };
}

