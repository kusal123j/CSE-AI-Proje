import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { fetchAlphabeticalRows } from './cse.fetcher';
import {
  createFetchRun,
  findFetchRun,
  finishFetchRun,
  latestFetchRun,
  upsertCompany,
  upsertDailySnapshot,
  upsertSecurity
} from './cse.repository';
import { CseImportResult } from './cse.types';

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

export const cseService = {
  async runAlphabeticalImport(input?: { tradingDate?: string }): Promise<CseImportResult> {
    const run = await createFetchRun({ sourceUrl: env.CSE_IMPORT_SOURCE_URL, fetchMode: 'python-http' });
    let fetched: Awaited<ReturnType<typeof fetchAlphabeticalRows>>;
    try {
      fetched = await fetchAlphabeticalRows({ runId: run.id, tradingDate: input?.tradingDate ?? sriLankaDateString() });
    } catch (error) {
      await finishFetchRun(run.id, {
        status: 'FAILED',
        recordsFound: 0,
        companiesCreated: 0,
        companiesUpdated: 0,
        securitiesCreated: 0,
        securitiesUpdated: 0,
        snapshotsCreated: 0,
        snapshotsUpdated: 0,
        recordsFailed: 0,
        errorMessage: error instanceof Error ? error.message : 'Unknown CSE fetch error',
        warnings: []
      });
      throw error;
    }
    const tradingDate = input?.tradingDate ?? sriLankaDateString();
    const rawFilePath = fetched.rawStoragePath;

    const result = {
      runId: run.id,
      status: 'SUCCESS' as const,
      recordsFound: fetched.rows.length,
      recordsBeforeDeduplication: fetched.recordsBeforeDeduplication,
      recordsDeduplicated: fetched.recordsDeduplicated,
      companiesCreated: 0,
      companiesUpdated: 0,
      securitiesCreated: 0,
      securitiesUpdated: 0,
      snapshotsCreated: 0,
      snapshotsUpdated: 0,
      recordsFailed: 0,
      warnings: [...fetched.warnings],
      rawFilePath,
      rawStoragePath: fetched.rawStoragePath,
      tradingDate,
      fetchMode: fetched.fetchMode,
      lettersAttempted: fetched.lettersAttempted,
      lettersSuccessful: fetched.lettersSuccessful,
      lettersFailed: fetched.lettersFailed,
      failedLetters: fetched.failedLetters
    };

    for (const row of fetched.rows) {
      try {
        const company = await upsertCompany(row);
        if (company.inserted) result.companiesCreated += 1;
        else result.companiesUpdated += 1;

        const security = await upsertSecurity(company.id, row);
        if (security.inserted) result.securitiesCreated += 1;
        else result.securitiesUpdated += 1;

        const snapshot = await upsertDailySnapshot(security.id, row, tradingDate);
        if (snapshot.inserted) result.snapshotsCreated += 1;
        else result.snapshotsUpdated += 1;
      } catch (error) {
        result.recordsFailed += 1;
        result.warnings.push(`Failed to import ${row.symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const status = result.recordsFailed > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS';
    await finishFetchRun(run.id, { ...result, status });
    return { ...result, status };
  },

  async importConfig() {
    const internalSecretConfigured = Boolean(env.CSE_IMPORT_INTERNAL_SECRET.trim());
    const lastImport = await latestFetchRun();
    return {
      mode: env.CSE_IMPORT_FETCH_MODE,
      source: 'CSE_LISTED_COMPANY_DIRECTORY_ALPHABETICAL',
      sourceUrl: env.CSE_IMPORT_SOURCE_URL,
      directApiExportAllowed: false,
      browserAutomationEnabled: false,
      browserAutomationOnly: false,
      playwrightEnabled: false,
      fallbackEnabled: false,
      scheduleEnabled: env.CSE_IMPORT_SCHEDULER_ENABLED,
      schedulerEnabled: env.CSE_IMPORT_SCHEDULER_ENABLED,
      realTimeProgressAvailable: false,
      weekdaysOnly: env.CSE_IMPORT_WEEKDAYS_ONLY,
      scheduledHour: env.CSE_IMPORT_HOUR,
      scheduledMinute: env.CSE_IMPORT_MINUTE,
      timeoutSeconds: env.CSE_IMPORT_TIMEOUT_SECONDS,
      maxRetries: env.CSE_IMPORT_MAX_RETRIES,
      readAccessMode: env.CSE_IMPORT_ALLOW_UNPROTECTED_READS ? 'unprotected-read' : 'protected-secret',
      manualRunAccessMode: env.CSE_IMPORT_ALLOW_UNPROTECTED_MANUAL_RUN
        ? 'unprotected-manual-run'
        : internalSecretConfigured
          ? 'protected-secret'
          : 'disabled-missing-secret',
      manualRunEnabled: env.CSE_IMPORT_ALLOW_UNPROTECTED_MANUAL_RUN || internalSecretConfigured,
      manualRunRequiresSecret: !env.CSE_IMPORT_ALLOW_UNPROTECTED_MANUAL_RUN,
      internalSecretConfigured,
      lastImport: lastImport
        ? {
            status: String(lastImport.status).toLowerCase(),
            startedAt: lastImport.started_at,
            finishedAt: lastImport.finished_at,
            rowCount: lastImport.records_found
          }
        : null
    };
  },

  async rawRunSummary(runId: string) {
    const run = await findFetchRun(runId);
    if (!run) throw new AppError(404, 'CSE fetch run not found');

    const rawFilePath = run.raw_file_path as string | null;
    const warnings = parseWarnings(run.warnings_json);
    if (!rawFilePath) {
      return {
        runId,
        available: false,
        rawFilePath: null,
        files: [],
        warnings,
        parseErrors: [],
        failedRows: [],
        reason: 'This fetch run does not have a raw file path recorded.'
      };
    }

    try {
      const entries = await fs.readdir(rawFilePath, { withFileTypes: true });
      const files = await Promise.all(
        entries
          .filter((entry) => entry.isFile())
          .map(async (entry) => {
            const absolute = path.join(rawFilePath, entry.name);
            const stat = await fs.stat(absolute);
            const extension = path.extname(entry.name).replace(/^\./, '').toLowerCase();
            const letterMatch = entry.name.match(/^([A-Z])\./);
            const type = entry.name === 'merged-normalized.json' ? 'merged-normalized-json' : letterMatch ? 'download' : extension || 'file';
            return {
              name: entry.name,
              path: safeRelativePath(absolute),
              extension,
              sizeBytes: stat.size,
              modifiedAt: stat.mtime.toISOString(),
              letter: letterMatch?.[1] ?? null,
              type
            };
          })
      );
      const merged = files.find((file) => file.name === 'merged-normalized.json')?.path ?? null;
      return {
        runId,
        available: true,
        rawFilePath: safeRelativePath(rawFilePath),
        files,
        mergedNormalizedJsonPath: merged,
        warnings,
        parseErrors: [],
        failedRows: []
      };
    } catch (error) {
      return {
        runId,
        available: false,
        rawFilePath: safeRelativePath(rawFilePath),
        files: [],
        warnings,
        parseErrors: [],
        failedRows: [],
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
