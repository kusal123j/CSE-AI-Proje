import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { fetchAlphabeticalRows, fetchDailyMarketSummary, fetchGicsRows, fetchTradeSummaryRows } from './cse.fetcher';
import {
  countRunningFetchRuns,
  createFetchRun,
  findFetchRun,
  finishFetchRun,
  latestFetchRun,
  latestSuccessfulFetchRun,
  listImportArtifacts,
  promoteGicsRows,
  promoteStagedAlphabeticalRows,
  promoteTradeSummaryRows,
  saveAlphabeticalRowsToStage,
  saveImportArtifact,
  upsertDailyMarketSummary
} from './cse.repository';
import { CseImportResult, CseImportStartResult, FetchDailyMarketSummaryResult } from './cse.types';
import { validateFetchedAlphabeticalResult } from './cse.validator';

let inProcessImport = false;
let inProcessTradeSummaryImport = false;
let inProcessGicsImport = false;
let inProcessDailyMarketSummaryImport = false;

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

async function executeGicsImport(runId: string, input: { tradingDate: string; triggerType: 'manual' | 'scheduled' }): Promise<CseImportResult> {
  let runAlreadyFinished = false;
  try {
    const fetched = await fetchGicsRows({ runId, tradingDate: input.tradingDate });

    await saveImportArtifact({
      runId,
      artifactType: 'gics_summary_raw_response',
      filePath: fetched.rawArtifactPaths.summaryRaw,
      rowCount: fetched.summaryRows.length
    });
    await saveImportArtifact({
      runId,
      artifactType: 'gics_indices_raw_response',
      filePath: fetched.rawArtifactPaths.indicesRaw,
      rowCount: fetched.indexRows.length
    });
    await saveImportArtifact({
      runId,
      artifactType: 'gics_classification_raw_response',
      filePath: fetched.rawArtifactPaths.classificationRaw,
      rowCount: fetched.classificationRows.length
    });
    await saveImportArtifact({ runId, artifactType: 'gics_import_report', filePath: fetched.rawArtifactPaths.importReport, rowCount: fetched.classificationRows.length });
    const validationReportPath = await writeValidationReport(fetched.rawStoragePath, fetched.validationReport);
    await saveImportArtifact({ runId, artifactType: 'validation_report', filePath: validationReportPath, rowCount: fetched.classificationRows.length });

    if (!fetched.validationReport.valid) {
      const errorMessage = `CSE GICS import validation failed: ${fetched.validationReport.errors.join(' | ')}`;
      await finishFetchRun(runId, {
        status: 'FAILED',
        recordsFound: fetched.classificationRows.length,
        companiesCreated: 0,
        companiesUpdated: 0,
        securitiesCreated: 0,
        securitiesUpdated: 0,
        snapshotsCreated: 0,
        snapshotsUpdated: 0,
        recordsFailed: fetched.classificationRows.length,
        errorMessage,
        warnings: fetched.validationReport.warnings,
        rawFilePath: fetched.rawStoragePath,
        recordsBeforeDeduplication: fetched.recordsBeforeDeduplication,
        recordsDeduplicated: fetched.recordsDeduplicated,
        validationReport: fetched.validationReport as never
      });
      runAlreadyFinished = true;
      throw new AppError(502, errorMessage);
    }

    const promoted = await promoteGicsRows(runId, {
      tradingDate: input.tradingDate,
      sourceUrl: fetched.classificationUrl,
      industryGroups: fetched.industryGroups,
      summaryRows: fetched.summaryRows,
      indexRows: fetched.indexRows,
      classificationRows: fetched.classificationRows
    });

    const warnings = [...fetched.warnings, ...promoted.warnings];
    const status: 'SUCCESS' | 'PARTIAL_SUCCESS' = warnings.length > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS';
    const result: CseImportResult = {
      runId,
      status,
      recordsFound: fetched.classificationRows.length,
      recordsBeforeDeduplication: fetched.recordsBeforeDeduplication,
      recordsDeduplicated: fetched.recordsDeduplicated,
      companiesCreated: 0,
      companiesUpdated: 0,
      securitiesCreated: promoted.classificationsCreated,
      securitiesUpdated: promoted.classificationsUpdated,
      snapshotsCreated: promoted.classificationSnapshotsCreated,
      snapshotsUpdated: promoted.classificationSnapshotsUpdated,
      recordsFailed: 0,
      warnings,
      rawFilePath: fetched.rawStoragePath,
      rawStoragePath: fetched.rawStoragePath,
      tradingDate: input.tradingDate,
      fetchMode: fetched.fetchMode,
      validationReport: fetched.validationReport as never
    };

    await finishFetchRun(runId, {
      status,
      recordsFound: result.recordsFound,
      companiesCreated: promoted.industryGroupsCreated,
      companiesUpdated: promoted.industryGroupsUpdated,
      securitiesCreated: promoted.classificationsCreated,
      securitiesUpdated: promoted.classificationsUpdated,
      snapshotsCreated: promoted.classificationSnapshotsCreated + promoted.summariesCreated + promoted.indicesCreated,
      snapshotsUpdated: promoted.classificationSnapshotsUpdated + promoted.summariesUpdated + promoted.indicesUpdated,
      recordsFailed: 0,
      warnings,
      rawFilePath: fetched.rawStoragePath,
      recordsBeforeDeduplication: fetched.recordsBeforeDeduplication,
      recordsDeduplicated: fetched.recordsDeduplicated,
      validationReport: { ...fetched.validationReport, unmappedSymbols: promoted.unmappedSymbols } as never
    });
    runAlreadyFinished = true;
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown CSE GICS import error';
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
    inProcessGicsImport = false;
  }
}


const DAILY_MARKET_SUMMARY_REQUIRED_FIELDS = [
  'tradingDate',
  'aspiToday',
  'aspiPrevious',
  'spSl20Today',
  'spSl20Previous',
  'equityTurnoverToday',
  'equityTurnoverPrevious',
  'marketCapToday',
  'marketCapPrevious',
  'listedCompaniesToday',
  'tradedCompaniesToday'
] as const;

function validateDailyMarketSummaryBeforeSave(fetched: FetchDailyMarketSummaryResult) {
  const errors = [...(fetched.validationReport?.errors ?? [])];
  for (const field of DAILY_MARKET_SUMMARY_REQUIRED_FIELDS) {
    if (field === 'tradingDate') {
      if (!fetched.tradingDate && !fetched.summary?.tradingDate) errors.push('Required Daily Market Summary field missing before DB save: tradingDate');
      continue;
    }
    if (fetched.summary?.[field] === null || fetched.summary?.[field] === undefined || fetched.summary?.[field] === '') {
      errors.push(`Required Daily Market Summary field missing before DB save: ${field}`);
    }
  }
  return {
    valid: errors.length === 0 && fetched.validationReport?.valid === true,
    errors,
    warnings: fetched.validationReport?.warnings ?? fetched.warnings ?? [],
    requiredFields: Array.from(DAILY_MARKET_SUMMARY_REQUIRED_FIELDS),
    parsedFieldCount: fetched.validationReport?.parsedFieldCount ?? Object.values(fetched.summary ?? {}).filter((value) => value !== null && value !== undefined && value !== '').length,
    promotionAllowed: errors.length === 0 && fetched.validationReport?.promotionAllowed === true
  };
}

async function executeDailyMarketSummaryImport(runId: string, input: { tradingDate: string; triggerType: 'manual' | 'scheduled' }): Promise<CseImportResult> {
  let runAlreadyFinished = false;
  try {
    const fetched = await fetchDailyMarketSummary({ runId, tradingDate: input.tradingDate });
    const saveValidationReport = validateDailyMarketSummaryBeforeSave(fetched);
    if (!saveValidationReport.valid) {
      await finishFetchRun(runId, {
        status: 'FAILED',
        recordsFound: 0,
        companiesCreated: 0,
        companiesUpdated: 0,
        securitiesCreated: 0,
        securitiesUpdated: 0,
        snapshotsCreated: 0,
        snapshotsUpdated: 0,
        recordsFailed: 1,
        errorMessage: `Daily Market Summary backend validation failed: ${saveValidationReport.errors.join(' | ')}`,
        warnings: saveValidationReport.warnings,
        rawFilePath: fetched.rawStoragePath,
        recordsBeforeDeduplication: 1,
        recordsDeduplicated: 0,
        validationReport: saveValidationReport as never
      });
      runAlreadyFinished = true;
      throw new AppError(422, `Daily Market Summary backend validation failed: ${saveValidationReport.errors.join(' | ')}`);
    }
    const fetchedForSave = { ...fetched, validationReport: saveValidationReport };
    const saved = await upsertDailyMarketSummary(runId, fetchedForSave);

    await saveImportArtifact({
      runId,
      artifactType: 'daily_market_summary_raw_response',
      filePath: fetched.rawArtifactPath,
      checksum: fetched.checksum ?? null,
      rowCount: 1
    });
    await saveImportArtifact({
      runId,
      artifactType: 'daily_market_summary_normalized_json',
      filePath: fetched.normalizedArtifactPath,
      rowCount: 1
    });
    await saveImportArtifact({
      runId,
      artifactType: 'validation_report',
      filePath: fetched.validationArtifactPath,
      rowCount: 1
    });

    const status: 'SUCCESS' | 'PARTIAL_SUCCESS' = fetched.warnings.length > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS';
    const result: CseImportResult = {
      runId,
      status,
      recordsFound: 1,
      recordsBeforeDeduplication: 1,
      recordsDeduplicated: 0,
      companiesCreated: 0,
      companiesUpdated: 0,
      securitiesCreated: 0,
      securitiesUpdated: 0,
      snapshotsCreated: saved?.inserted ? 1 : 0,
      snapshotsUpdated: saved?.inserted ? 0 : 1,
      recordsFailed: 0,
      warnings: fetched.warnings,
      rawFilePath: fetched.rawStoragePath,
      rawStoragePath: fetched.rawStoragePath,
      tradingDate: fetched.tradingDate,
      fetchMode: fetched.fetchMode,
      validationReport: saveValidationReport as never
    };

    await finishFetchRun(runId, {
      status,
      recordsFound: 1,
      companiesCreated: 0,
      companiesUpdated: 0,
      securitiesCreated: 0,
      securitiesUpdated: 0,
      snapshotsCreated: result.snapshotsCreated,
      snapshotsUpdated: result.snapshotsUpdated,
      recordsFailed: 0,
      warnings: fetched.warnings,
      rawFilePath: fetched.rawStoragePath,
      recordsBeforeDeduplication: 1,
      recordsDeduplicated: 0,
      validationReport: saveValidationReport as never
    });
    runAlreadyFinished = true;
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown CSE Daily Market Summary import error';
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
    inProcessDailyMarketSummaryImport = false;
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

  async startGicsImportJob(input?: { tradingDate?: string; triggerType?: 'manual' | 'scheduled' }): Promise<CseImportStartResult> {
    if (!env.CSE_GICS_ENABLED) {
      throw new AppError(403, 'CSE GICS importer is disabled by CSE_GICS_ENABLED=false.');
    }
    if (inProcessGicsImport || inProcessTradeSummaryImport || inProcessImport || (await countRunningFetchRuns()) > 0) {
      throw new AppError(409, 'A CSE import is already running. Wait until the current import finishes before starting another one.');
    }

    inProcessGicsImport = true;
    const triggerType = input?.triggerType ?? 'manual';
    const tradingDate = input?.tradingDate ?? sriLankaDateString();
    const run = await createFetchRun({ source: 'CSE_GICS', sourceUrl: env.CSE_GICS_CLASSIFICATION_SOURCE_URL, fetchMode: 'python-http', triggerType });

    setImmediate(() => {
      executeGicsImport(run.id, { tradingDate, triggerType }).catch((error) => {
        console.error('CSE GICS background import failed', error);
      });
    });

    return {
      ok: true,
      runId: run.id,
      status: 'RUNNING',
      triggerType,
      tradingDate,
      message: 'CSE GICS import started. Poll /api/cse/import/runs/:id for status.'
    };
  },

  async runGicsImport(input?: { tradingDate?: string; triggerType?: 'manual' | 'scheduled' }): Promise<CseImportResult> {
    if (!env.CSE_GICS_ENABLED) {
      throw new AppError(403, 'CSE GICS importer is disabled by CSE_GICS_ENABLED=false.');
    }
    if (inProcessGicsImport || inProcessTradeSummaryImport || inProcessImport || (await countRunningFetchRuns()) > 0) {
      throw new AppError(409, 'A CSE import is already running. Wait until the current import finishes before starting another one.');
    }

    inProcessGicsImport = true;
    const triggerType = input?.triggerType ?? 'manual';
    const tradingDate = input?.tradingDate ?? sriLankaDateString();
    const run = await createFetchRun({ source: 'CSE_GICS', sourceUrl: env.CSE_GICS_CLASSIFICATION_SOURCE_URL, fetchMode: 'python-http', triggerType });
    return executeGicsImport(run.id, { tradingDate, triggerType });
  },


  async startDailyMarketSummaryImportJob(input?: { tradingDate?: string; triggerType?: 'manual' | 'scheduled' }): Promise<CseImportStartResult> {
    if (!env.CSE_DAILY_MARKET_SUMMARY_ENABLED) {
      throw new AppError(403, 'CSE Daily Market Summary importer is disabled by CSE_DAILY_MARKET_SUMMARY_ENABLED=false.');
    }
    if (inProcessDailyMarketSummaryImport || inProcessGicsImport || inProcessTradeSummaryImport || inProcessImport || (await countRunningFetchRuns()) > 0) {
      throw new AppError(409, 'A CSE import is already running. Wait until the current import finishes before starting another one.');
    }

    inProcessDailyMarketSummaryImport = true;
    const triggerType = input?.triggerType ?? 'manual';
    const tradingDate = input?.tradingDate ?? sriLankaDateString();
    const run = await createFetchRun({ source: 'CSE_DAILY_MARKET_SUMMARY', sourceUrl: env.CSE_DAILY_MARKET_SUMMARY_SOURCE_URL, fetchMode: 'python-http', triggerType });

    setImmediate(() => {
      executeDailyMarketSummaryImport(run.id, { tradingDate, triggerType }).catch((error) => {
        console.error('CSE Daily Market Summary background import failed', error);
      });
    });

    return {
      ok: true,
      runId: run.id,
      status: 'RUNNING',
      triggerType,
      tradingDate,
      message: 'CSE Daily Market Summary import started. Poll /api/cse/import/runs/:id for status.'
    };
  },

  async runDailyMarketSummaryImport(input?: { tradingDate?: string; triggerType?: 'manual' | 'scheduled' }): Promise<CseImportResult> {
    if (!env.CSE_DAILY_MARKET_SUMMARY_ENABLED) {
      throw new AppError(403, 'CSE Daily Market Summary importer is disabled by CSE_DAILY_MARKET_SUMMARY_ENABLED=false.');
    }
    if (inProcessDailyMarketSummaryImport || inProcessGicsImport || inProcessTradeSummaryImport || inProcessImport || (await countRunningFetchRuns()) > 0) {
      throw new AppError(409, 'A CSE import is already running. Wait until the current import finishes before starting another one.');
    }

    inProcessDailyMarketSummaryImport = true;
    const triggerType = input?.triggerType ?? 'manual';
    const tradingDate = input?.tradingDate ?? sriLankaDateString();
    const run = await createFetchRun({ source: 'CSE_DAILY_MARKET_SUMMARY', sourceUrl: env.CSE_DAILY_MARKET_SUMMARY_SOURCE_URL, fetchMode: 'python-http', triggerType });
    return executeDailyMarketSummaryImport(run.id, { tradingDate, triggerType });
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
      dailyMarketSummary: {
        enabled: env.CSE_DAILY_MARKET_SUMMARY_ENABLED,
        source: 'CSE_DAILY_MARKET_SUMMARY',
        sourceUrl: env.CSE_DAILY_MARKET_SUMMARY_SOURCE_URL,
        fetchMode: 'python-http',
        fetchStrategy: 'api-first-html-fallback',
        htmlFallbackEnabled: true,
        browserAutomationEnabled: false,
        playwrightEnabled: false,
        schedulerEnabled: env.CSE_DAILY_MARKET_SUMMARY_SCHEDULER_ENABLED,
        weekdaysOnly: env.CSE_DAILY_MARKET_SUMMARY_WEEKDAYS_ONLY,
        scheduledHour: env.CSE_DAILY_MARKET_SUMMARY_HOUR,
        scheduledMinute: env.CSE_DAILY_MARKET_SUMMARY_MINUTE,
        timeoutSeconds: env.CSE_DAILY_MARKET_SUMMARY_TIMEOUT_SECONDS,
        artifactStorageDir: env.CSE_DAILY_MARKET_SUMMARY_ARTIFACT_STORAGE_DIR
      },
      gics: {
        enabled: env.CSE_GICS_ENABLED,
        source: 'CSE_GICS',
        summaryUrl: env.CSE_GICS_SUMMARY_SOURCE_URL,
        indicesUrl: env.CSE_GICS_INDICES_SOURCE_URL,
        classificationUrl: env.CSE_GICS_CLASSIFICATION_SOURCE_URL,
        fetchMode: 'python-http',
        csvDownloadPreferred: true,
        htmlFallbackEnabled: true,
        browserAutomationEnabled: false,
        playwrightEnabled: false,
        schedulerEnabled: env.CSE_GICS_SCHEDULER_ENABLED,
        minExpectedGroups: env.CSE_GICS_MIN_EXPECTED_GROUPS,
        minExpectedClassificationRows: env.CSE_GICS_MIN_EXPECTED_CLASSIFICATION_ROWS,
        timeoutSeconds: env.CSE_GICS_TIMEOUT_SECONDS,
        artifactStorageDir: env.CSE_GICS_ARTIFACT_STORAGE_DIR
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
