import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { fetchAlphabeticalRows, fetchTradeSummaryRows } from './cse.fetcher';
import {
  countRunningFetchRuns,
  createFetchRun,
  findFetchRun,
  finishFetchRun,
  latestFetchRun,
  latestSuccessfulFetchRun,
  listImportArtifacts,
  promoteStagedAlphabeticalRows,
  promoteTradeSummaryRows,
  saveAlphabeticalRowsToStage,
  saveImportArtifact
} from './cse.repository';
import { CseImportResult, CseImportStartResult } from './cse.types';
import { validateFetchedAlphabeticalResult } from './cse.validator';

let inProcessImport = false;
let inProcessTradeSummaryImport = false;

function sriLankaDateString(date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

function parseWarnings(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return [value];
    }
  }
  return [];
}

function safeRelativePath(filePath: string): string {
  return path.isAbsolute(filePath) ? path.relative(process.cwd(), filePath) : filePath;
}

export function summarizeTradeSummaryCompletion(input: {
  rowCount: number;
  fetchedWarnings?: string[];
  promotionWarnings?: string[];
  minExpectedRows: number;
}): { status: 'SUCCESS' | 'PARTIAL_SUCCESS'; warnings: string[] } {
  const warnings = [...(input.fetchedWarnings ?? []), ...(input.promotionWarnings ?? [])];
  if (input.rowCount < input.minExpectedRows) {
    const rowCountWarning = `Trade Summary row count ${input.rowCount} is below configured minimum ${input.minExpectedRows}.`;
    if (!warnings.includes(rowCountWarning)) warnings.push(rowCountWarning);
  }
  return {
    status: warnings.length > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS',
    warnings
  };
}

async function collectFilesRecursive(directory: string) {
  const results: Array<{ name: string; path: string; absolute: string; extension: string; sizeBytes: number; modifiedAt: string; letter: string | null; type: string }> = [];

  async function walk(current: string) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      const stat = await fs.stat(absolute);
      const relative = safeRelativePath(absolute);
      const extension = path.extname(entry.name).replace(/^\./, '').toLowerCase();
      const letterMatch = entry.name.match(/^([A-Z])\.json$/);
      const type = relative.includes(`${path.sep}raw${path.sep}`)
        ? 'raw-letter-json'
        : entry.name === 'merged-normalized.json'
          ? 'merged-normalized-json'
          : entry.name.includes('validation')
            ? 'validation-report'
            : entry.name.includes('import-report')
              ? 'import-report'
              : extension || 'file';
      results.push({
        name: entry.name,
        path: relative,
        absolute,
        extension,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        letter: letterMatch?.[1] ?? null,
        type
      });
    }
  }

  await walk(directory);
  return results.sort((a, b) => a.path.localeCompare(b.path));
}

async function writeValidationReport(rawStoragePath: string, report: unknown): Promise<string> {
  const reportsDir = path.join(rawStoragePath, 'reports');
  await fs.mkdir(reportsDir, { recursive: true });
  const filePath = path.join(reportsDir, 'validation-report.json');
  await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf8');
  return filePath;
}

async function executeAlphabeticalImport(runId: string, input: { tradingDate: string; triggerType: 'manual' | 'scheduled' }): Promise<CseImportResult> {
  let runAlreadyFinished = false;
  try {
    const fetched = await fetchAlphabeticalRows({ runId, tradingDate: input.tradingDate });
    await saveAlphabeticalRowsToStage(runId, fetched.rows, input.tradingDate);

    const validationReport = validateFetchedAlphabeticalResult(fetched);
    fetched.validationReport = validationReport;
    const validationReportPath = await writeValidationReport(fetched.rawStoragePath, validationReport);

    for (const artifact of fetched.rawArtifacts ?? []) {
      await saveImportArtifact({
        runId,
        letter: artifact.letter,
        artifactType: 'api_response',
        filePath: artifact.filePath,
        checksum: artifact.checksum,
        rowCount: artifact.rowCount
      });
    }
    await saveImportArtifact({ runId, artifactType: 'validation_report', filePath: validationReportPath, rowCount: validationReport.rawRowCount });
    await saveImportArtifact({
      runId,
      artifactType: 'normalized_json',
      filePath: path.join(fetched.rawStoragePath, 'normalized', 'merged-normalized.json'),
      rowCount: fetched.rows.length
    });

    if (!validationReport.valid) {
      const errorMessage = `CSE import validation failed: ${validationReport.errors.join(' | ')}`;
      await finishFetchRun(runId, {
        status: 'FAILED',
        recordsFound: fetched.rows.length,
        companiesCreated: 0,
        companiesUpdated: 0,
        securitiesCreated: 0,
        securitiesUpdated: 0,
        snapshotsCreated: 0,
        snapshotsUpdated: 0,
        recordsFailed: fetched.rows.length,
        errorMessage,
        warnings: validationReport.warnings,
        rawFilePath: fetched.rawStoragePath,
        lettersAttempted: fetched.lettersAttempted,
        lettersSuccessful: fetched.lettersSuccessful,
        lettersFailed: fetched.lettersFailed,
        recordsBeforeDeduplication: fetched.recordsBeforeDeduplication,
        recordsDeduplicated: fetched.recordsDeduplicated,
        validationReport
      });
      runAlreadyFinished = true;
      throw new AppError(502, errorMessage);
    }

    const promoted = await promoteStagedAlphabeticalRows(runId);
    const result: CseImportResult = {
      runId,
      status: 'SUCCESS',
      recordsFound: fetched.rows.length,
      recordsBeforeDeduplication: fetched.recordsBeforeDeduplication,
      recordsDeduplicated: fetched.recordsDeduplicated,
      ...promoted,
      recordsFailed: 0,
      warnings: validationReport.warnings,
      rawFilePath: fetched.rawStoragePath,
      rawStoragePath: fetched.rawStoragePath,
      tradingDate: input.tradingDate,
      fetchMode: fetched.fetchMode,
      lettersAttempted: fetched.lettersAttempted,
      lettersSuccessful: fetched.lettersSuccessful,
      lettersFailed: fetched.lettersFailed,
      failedLetters: fetched.failedLetters,
      validationReport
    };

    await finishFetchRun(runId, {
      status: 'SUCCESS',
      recordsFound: result.recordsFound,
      companiesCreated: result.companiesCreated,
      companiesUpdated: result.companiesUpdated,
      securitiesCreated: result.securitiesCreated,
      securitiesUpdated: result.securitiesUpdated,
      snapshotsCreated: result.snapshotsCreated,
      snapshotsUpdated: result.snapshotsUpdated,
      recordsFailed: 0,
      warnings: result.warnings,
      rawFilePath: fetched.rawStoragePath,
      lettersAttempted: fetched.lettersAttempted,
      lettersSuccessful: fetched.lettersSuccessful,
      lettersFailed: fetched.lettersFailed,
      recordsBeforeDeduplication: fetched.recordsBeforeDeduplication,
      recordsDeduplicated: fetched.recordsDeduplicated,
      validationReport
    });
    runAlreadyFinished = true;
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown CSE import error';
    if (!runAlreadyFinished) {
      await finishFetchRun(runId, {
        status: 'FAILED',
        recordsFound: 0,
        companiesCreated: 0,
        companiesUpdated: 0,
        securitiesCreated: 0,
        securitiesUpdated: 0,
        snapshotsCreated: 0,
        snapshotsUpdated: 0,
        recordsFailed: 0,
        errorMessage: message,
        warnings: []
      }).catch(() => undefined);
    }
    throw error;
  } finally {
    inProcessImport = false;
  }
}

async function executeTradeSummaryImport(runId: string, input: { tradingDate: string; triggerType: 'manual' | 'scheduled' }): Promise<CseImportResult> {
  let runAlreadyFinished = false;
  try {
    const fetched = await fetchTradeSummaryRows({ runId, tradingDate: input.tradingDate });
    if (fetched.rows.length === 0) {
      throw new AppError(502, 'CSE Trade Summary import returned an empty dataset.');
    }

    const promoted = await promoteTradeSummaryRows(runId, fetched.rows, input.tradingDate, {
      marketTimestamp: fetched.marketTimestamp ?? null,
      sourceMarketTimestampText: fetched.sourceMarketTimestampText ?? null
    });

    await saveImportArtifact({
      runId,
      artifactType: 'trade_summary_raw_response',
      filePath: fetched.rawArtifactPath,
      checksum: fetched.checksum ?? null,
      rowCount: fetched.rows.length
    });
    await saveImportArtifact({
      runId,
      artifactType: 'trade_summary_normalized_json',
      filePath: path.join(fetched.rawStoragePath, 'normalized', 'trade-summary-normalized.json'),
      rowCount: fetched.rows.length
    });

    const completion = summarizeTradeSummaryCompletion({
      rowCount: fetched.rows.length,
      fetchedWarnings: fetched.warnings,
      promotionWarnings: promoted.warnings,
      minExpectedRows: env.CSE_TRADE_SUMMARY_MIN_EXPECTED_ROWS
    });
    const status = completion.status;
    const result: CseImportResult = {
      runId,
      status,
      recordsFound: fetched.rows.length,
      recordsBeforeDeduplication: fetched.recordsBeforeDeduplication,
      recordsDeduplicated: fetched.recordsDeduplicated,
      companiesCreated: promoted.companiesCreated,
      companiesUpdated: promoted.companiesUpdated,
      securitiesCreated: promoted.securitiesCreated,
      securitiesUpdated: promoted.securitiesUpdated,
      snapshotsCreated: promoted.snapshotsCreated,
      snapshotsUpdated: promoted.snapshotsUpdated,
      recordsFailed: 0,
      warnings: completion.warnings,
      rawFilePath: fetched.rawStoragePath,
      rawStoragePath: fetched.rawStoragePath,
      tradingDate: input.tradingDate,
      fetchMode: fetched.fetchMode
    };

    await finishFetchRun(runId, {
      status,
      recordsFound: result.recordsFound,
      companiesCreated: result.companiesCreated,
      companiesUpdated: result.companiesUpdated,
      securitiesCreated: result.securitiesCreated,
      securitiesUpdated: result.securitiesUpdated,
      snapshotsCreated: result.snapshotsCreated,
      snapshotsUpdated: result.snapshotsUpdated,
      recordsFailed: 0,
      warnings: result.warnings,
      rawFilePath: fetched.rawStoragePath,
      recordsBeforeDeduplication: fetched.recordsBeforeDeduplication,
      recordsDeduplicated: fetched.recordsDeduplicated,
      validationReport: null
    });
    runAlreadyFinished = true;
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown CSE Trade Summary import error';
    if (!runAlreadyFinished) {
      await finishFetchRun(runId, {
        status: 'FAILED',
        recordsFound: 0,
        companiesCreated: 0,
        companiesUpdated: 0,
        securitiesCreated: 0,
        securitiesUpdated: 0,
        snapshotsCreated: 0,
        snapshotsUpdated: 0,
        recordsFailed: 0,
        errorMessage: message,
        warnings: []
      }).catch(() => undefined);
    }
    throw error;
  } finally {
    inProcessTradeSummaryImport = false;
  }
}

export const cseService = {
  async startAlphabeticalImportJob(input?: { tradingDate?: string; triggerType?: 'manual' | 'scheduled' }): Promise<CseImportStartResult> {
    if (inProcessImport || (await countRunningFetchRuns()) > 0) {
      throw new AppError(409, 'A CSE A-Z import is already running. Wait until the current import finishes before starting another one.');
    }

    inProcessImport = true;
    const triggerType = input?.triggerType ?? 'manual';
    const tradingDate = input?.tradingDate ?? sriLankaDateString();
    const run = await createFetchRun({ sourceUrl: env.CSE_IMPORT_SOURCE_URL, fetchMode: 'python-http', triggerType });

    setImmediate(() => {
      executeAlphabeticalImport(run.id, { tradingDate, triggerType }).catch((error) => {
        // executeAlphabeticalImport records the failed run; keep this catch to avoid unhandled rejections.
        console.error('CSE background import failed', error);
      });
    });

    return {
      ok: true,
      runId: run.id,
      status: 'RUNNING',
      triggerType,
      tradingDate,
      message: 'CSE A-Z import started. Poll /api/cse/import/runs/:id for status.'
    };
  },

  async runAlphabeticalImport(input?: { tradingDate?: string; triggerType?: 'manual' | 'scheduled' }): Promise<CseImportResult> {
    if (inProcessImport || (await countRunningFetchRuns()) > 0) {
      throw new AppError(409, 'A CSE A-Z import is already running. Wait until the current import finishes before starting another one.');
    }

    inProcessImport = true;
    const triggerType = input?.triggerType ?? 'manual';
    const tradingDate = input?.tradingDate ?? sriLankaDateString();
    const run = await createFetchRun({ sourceUrl: env.CSE_IMPORT_SOURCE_URL, fetchMode: 'python-http', triggerType });
    return executeAlphabeticalImport(run.id, { tradingDate, triggerType });
  },

  async startTradeSummaryImportJob(input?: { tradingDate?: string; triggerType?: 'manual' | 'scheduled' }): Promise<CseImportStartResult> {
    if (!env.CSE_TRADE_SUMMARY_ENABLED) {
      throw new AppError(403, 'CSE Trade Summary importer is disabled by CSE_TRADE_SUMMARY_ENABLED=false.');
    }
    if (inProcessTradeSummaryImport || inProcessImport || (await countRunningFetchRuns()) > 0) {
      throw new AppError(409, 'A CSE import is already running. Wait until the current import finishes before starting another one.');
    }

    inProcessTradeSummaryImport = true;
    const triggerType = input?.triggerType ?? 'manual';
    const tradingDate = input?.tradingDate ?? sriLankaDateString();
    const run = await createFetchRun({ source: 'CSE_TRADE_SUMMARY', sourceUrl: env.CSE_TRADE_SUMMARY_SOURCE_URL, fetchMode: 'python-http', triggerType });

    setImmediate(() => {
      executeTradeSummaryImport(run.id, { tradingDate, triggerType }).catch((error) => {
        console.error('CSE Trade Summary background import failed', error);
      });
    });

    return {
      ok: true,
      runId: run.id,
      status: 'RUNNING',
      triggerType,
      tradingDate,
      message: 'CSE Trade Summary import started. Poll /api/cse/import/runs/:id for status.'
    };
  },

  async runTradeSummaryImport(input?: { tradingDate?: string; triggerType?: 'manual' | 'scheduled' }): Promise<CseImportResult> {
    if (!env.CSE_TRADE_SUMMARY_ENABLED) {
      throw new AppError(403, 'CSE Trade Summary importer is disabled by CSE_TRADE_SUMMARY_ENABLED=false.');
    }
    if (inProcessTradeSummaryImport || inProcessImport || (await countRunningFetchRuns()) > 0) {
      throw new AppError(409, 'A CSE import is already running. Wait until the current import finishes before starting another one.');
    }

    inProcessTradeSummaryImport = true;
    const triggerType = input?.triggerType ?? 'manual';
    const tradingDate = input?.tradingDate ?? sriLankaDateString();
    const run = await createFetchRun({ source: 'CSE_TRADE_SUMMARY', sourceUrl: env.CSE_TRADE_SUMMARY_SOURCE_URL, fetchMode: 'python-http', triggerType });
    return executeTradeSummaryImport(run.id, { tradingDate, triggerType });
  },

  async importConfig() {
    const internalSecretConfigured = Boolean(env.CSE_IMPORT_INTERNAL_SECRET.trim());
    const lastImport = await latestFetchRun();
    const lastSuccessfulImport = await latestSuccessfulFetchRun();
    return {
      mode: env.CSE_IMPORT_FETCH_MODE,
      source: 'CSE_LISTED_COMPANY_DIRECTORY_ALPHABETICAL',
      sourceUrl: env.CSE_IMPORT_SOURCE_URL,
      tradeSummary: {
        enabled: env.CSE_TRADE_SUMMARY_ENABLED,
        source: 'CSE_TRADE_SUMMARY',
        sourceUrl: env.CSE_TRADE_SUMMARY_SOURCE_URL,
        fetchGranularity: 'FULL_TRADE_SUMMARY_SNAPSHOT',
        directApiExportAllowed: true,
        csvFallbackConfigured: Boolean(env.CSE_TRADE_SUMMARY_CSV_URL),
        csvDiscoveryEnabled: true,
        htmlFallbackEnabled: true,
        browserAutomationEnabled: false,
        playwrightEnabled: false,
        schedulerEnabled: env.CSE_TRADE_SUMMARY_SCHEDULER_ENABLED,
        weekdaysOnly: env.CSE_TRADE_SUMMARY_WEEKDAYS_ONLY,
        scheduledHour: env.CSE_TRADE_SUMMARY_HOUR,
        scheduledMinute: env.CSE_TRADE_SUMMARY_MINUTE,
        timeoutSeconds: env.CSE_TRADE_SUMMARY_TIMEOUT_SECONDS,
        minExpectedRows: env.CSE_TRADE_SUMMARY_MIN_EXPECTED_ROWS,
        artifactStorageDir: env.CSE_TRADE_SUMMARY_ARTIFACT_STORAGE_DIR
      },
      fetchGranularity: 'A_Z_LETTER_BY_LETTER',
      fullExportSupported: false,
      directApiExportAllowed: true,
      browserAutomationEnabled: false,
      browserAutomationOnly: false,
      playwrightEnabled: false,
      fallbackEnabled: false,
      letters: Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index)),
      minCompanies: env.CSE_IMPORT_MIN_COMPANIES,
      minSecurities: env.CSE_IMPORT_MIN_SECURITIES,
      minExpectedRows: env.CSE_IMPORT_MIN_EXPECTED_ROWS,
      scheduleEnabled: env.CSE_IMPORT_SCHEDULER_ENABLED,
      schedulerEnabled: env.CSE_IMPORT_SCHEDULER_ENABLED,
      realTimeProgressAvailable: false,
      weekdaysOnly: env.CSE_IMPORT_WEEKDAYS_ONLY,
      scheduledHour: env.CSE_IMPORT_HOUR,
      scheduledMinute: env.CSE_IMPORT_MINUTE,
      timeoutSeconds: env.CSE_IMPORT_TIMEOUT_SECONDS,
      jobTimeoutSeconds: env.CSE_IMPORT_JOB_TIMEOUT_SECONDS,
      letterTimeoutSeconds: env.CSE_IMPORT_LETTER_TIMEOUT_SECONDS,
      maxRetries: env.CSE_IMPORT_RETRY_COUNT,
      artifactStorageDir: env.CSE_IMPORT_ARTIFACT_STORAGE_DIR,
      staleAfterHours: env.CSE_IMPORT_STALE_AFTER_HOURS,
      readAccessMode: env.CSE_IMPORT_ALLOW_UNPROTECTED_READS ? 'unprotected-read' : 'protected-secret',
      manualRunAccessMode: env.CSE_IMPORT_ALLOW_UNPROTECTED_MANUAL_RUN
        ? 'unprotected-manual-run'
        : internalSecretConfigured
          ? 'protected-secret'
          : 'disabled-missing-secret',
      manualRunEnabled: env.CSE_IMPORT_ALLOW_UNPROTECTED_MANUAL_RUN || internalSecretConfigured,
      manualRunRequiresSecret: !env.CSE_IMPORT_ALLOW_UNPROTECTED_MANUAL_RUN,
      internalSecretConfigured,
      lastSuccessfulImportAt: lastSuccessfulImport?.finished_at ?? null,
      lastSuccessfulImportId: lastSuccessfulImport?.id ?? null,
      lastImport: lastImport
        ? {
            status: String(lastImport.status).toLowerCase(),
            startedAt: lastImport.started_at,
            finishedAt: lastImport.finished_at,
            rowCount: lastImport.records_found,
            triggerType: lastImport.trigger_type,
            validationReport: lastImport.validation_report ?? null
          }
        : null
    };
  },

  async rawRunSummary(runId: string) {
    const run = await findFetchRun(runId);
    if (!run) throw new AppError(404, 'CSE fetch run not found');

    const rawFilePath = run.raw_file_path as string | null;
    const warnings = parseWarnings(run.warnings_json);
    const dbArtifacts = await listImportArtifacts(runId).catch(() => []);
    if (!rawFilePath) {
      return {
        runId,
        available: false,
        rawFilePath: null,
        files: [],
        dbArtifacts,
        warnings,
        parseErrors: [],
        failedRows: [],
        reason: 'This fetch run does not have a raw file path recorded.'
      };
    }

    try {
      const files = await collectFilesRecursive(rawFilePath);
      const merged = files.find((file) => file.name === 'merged-normalized.json')?.path ?? null;
      const validationReport = files.find((file) => file.name === 'validation-report.json')?.path ?? null;
      return {
        runId,
        available: true,
        rawFilePath: safeRelativePath(rawFilePath),
        files,
        dbArtifacts,
        mergedNormalizedJsonPath: merged,
        validationReportPath: validationReport,
        warnings,
        parseErrors: run.validation_report?.errors ?? [],
        failedRows: [],
        validationReport: run.validation_report ?? null
      };
    } catch (error) {
      return {
        runId,
        available: false,
        rawFilePath: safeRelativePath(rawFilePath),
        files: [],
        dbArtifacts,
        warnings,
        parseErrors: [],
        failedRows: [],
        validationReport: run.validation_report ?? null,
        reason: error instanceof Error ? error.message : 'Raw file listing is not available yet.'
      };
    }
  },

  async markFailedRun(runId: string, error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown CSE import error';
    await finishFetchRun(runId, {
      status: 'FAILED',
      recordsFound: 0,
      companiesCreated: 0,
      companiesUpdated: 0,
      securitiesCreated: 0,
      securitiesUpdated: 0,
      snapshotsCreated: 0,
      snapshotsUpdated: 0,
      recordsFailed: 0,
      errorMessage: message,
      warnings: []
    });
  },

  assertImportAllowed() {
    if (env.CSE_IMPORT_ALLOW_UNPROTECTED_MANUAL_RUN) return;
    if (!env.CSE_IMPORT_INTERNAL_SECRET) {
      throw new AppError(403, 'CSE manual import is disabled. Configure CSE_IMPORT_INTERNAL_SECRET or enable scheduler.');
    }
  }
};
