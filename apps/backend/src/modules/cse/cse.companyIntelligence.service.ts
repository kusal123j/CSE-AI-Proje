import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { documentService } from '../documents/document.service';
import { createFetchRun, finishFetchRun, saveImportArtifact } from './cse.repository';
import {
  fetchAnnouncementsFromWorker,
  fetchCompanyProfileFromWorker,
  fetchFinancialReportsFromWorker,
  fetchLatestPricesFromWorker
} from './cse.companyIntelligence.fetcher';
import {
  CseAnnouncementInput,
  CseCompanyImportSummary,
  CseCompanyImportType,
  CseFinancialReportInput,
  CseLatestPriceInput,
  CseRetryFailedSymbolsInput
} from './cse.companyIntelligence.types';
import * as repo from './cse.companyIntelligence.repository';
import { assertCsePdfUrl } from './cse.sourceGuard';

let inProcessCompanyProfiles = false;
let inProcessFinancialReports = false;
let inProcessAnnouncements = false;
let inProcessLatestPrices = false;

function sriLankaDateString(date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function defaultAnnouncementRange() {
  const endDate = sriLankaDateString();
  const startDate = sriLankaDateString(addDays(new Date(), -env.CSE_COMPANY_ANNOUNCEMENTS_LOOKBACK_DAYS));
  return { startDate, endDate };
}

function marketStatusIsOpen(status?: string | null): boolean | null {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (!normalized) return null;
  if (/(open|continuous|trading|pre-open|pre open)/.test(normalized) && !/(closed|close)/.test(normalized)) return true;
  if (/(closed|close|halted|holiday|not\s+open)/.test(normalized)) return false;
  return null;
}

function safeRelativePath(filePath: string): string {
  return path.isAbsolute(filePath) ? path.relative(process.cwd(), filePath) : filePath;
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

async function writeRunArtifacts(runId: string, label: string, value: unknown): Promise<string> {
  const dir = path.resolve(process.cwd(), env.CSE_IMPORT_ARTIFACT_STORAGE_DIR, 'company-intelligence', sriLankaDateString(), runId, label);
  const filePath = path.join(dir, `${label}-normalized.json`);
  await writeJson(filePath, value);
  await saveImportArtifact({ runId, artifactType: label, filePath, rowCount: Array.isArray(value) ? value.length : undefined }).catch(() => undefined);
  return dir;
}

async function finishSimpleRun(runId: string, summary: CseCompanyImportSummary) {
  await finishFetchRun(runId, {
    status: summary.status,
    recordsFound: summary.recordsFound,
    companiesCreated: 0,
    companiesUpdated: 0,
    securitiesCreated: 0,
    securitiesUpdated: 0,
    snapshotsCreated: summary.recordsFound,
    snapshotsUpdated: 0,
    recordsFailed: summary.recordsFailed,
    warnings: summary.warnings,
    rawFilePath: summary.rawFilePath ?? null,
    errorMessage: summary.status === 'FAILED' ? summary.warnings.join(' | ') : null
  });
}

async function queueDocumentDownloads(documentIds: Array<string | null | undefined>) {
  const uniqueIds = [...new Set(documentIds.filter((id): id is string => Boolean(id)))];
  for (const documentId of uniqueIds) {
    await documentService.queueDownload(documentId).catch(() => undefined);
  }
}

function sanitizePdfInput<T extends { pdfUrl?: string | null; title?: string; announcementTitle?: string }>(input: T, warnings: string[], symbol: string): T {
  if (!input.pdfUrl) return input;
  try {
    assertCsePdfUrl(input.pdfUrl);
    return input;
  } catch (error) {
    const label = input.title ?? input.announcementTitle ?? 'CSE document';
    const message = error instanceof Error ? error.message : 'Invalid CSE PDF URL';
    warnings.push(`${symbol}: skipped non-CSE/invalid PDF URL for ${label}: ${message}`);
    return { ...input, pdfUrl: null };
  }
}

async function runForSymbols<T>(input: {
  runId: string;
  importType: CseCompanyImportType;
  symbols?: string[];
  limit?: number;
  handler: (identity: repo.CseSecurityIdentity) => Promise<{ recordsFound: number; documentsDiscovered?: number; announcementsDiscovered?: number; warnings?: string[] }>;
}) {
  const identities = input.symbols?.length
    ? (await Promise.all(input.symbols.map((symbol) => repo.findCseSecurityBySymbol(symbol)))).filter((item): item is repo.CseSecurityIdentity => Boolean(item))
    : await repo.listActiveCseSecurities(input.limit);

  const warnings: string[] = [];
  let recordsFound = 0;
  let recordsFailed = 0;
  let documentsDiscovered = 0;
  let announcementsDiscovered = 0;

  for (const identity of identities) {
    try {
      const result = await input.handler(identity);
      recordsFound += result.recordsFound;
      documentsDiscovered += result.documentsDiscovered ?? 0;
      announcementsDiscovered += result.announcementsDiscovered ?? 0;
      warnings.push(...(result.warnings ?? []));
      await repo.upsertSymbolImportResult({
        runId: input.runId,
        symbol: identity.symbol,
        importType: input.importType,
        status: result.warnings?.length ? 'PARTIAL_SUCCESS' : 'SUCCESS',
        recordsFound: result.recordsFound,
        documentsDiscovered: result.documentsDiscovered ?? 0,
        announcementsDiscovered: result.announcementsDiscovered ?? 0,
        warnings: result.warnings ?? []
      });
    } catch (error) {
      recordsFailed += 1;
      const message = error instanceof Error ? error.message : 'Unknown symbol import error';
      warnings.push(`${identity.symbol}: ${message}`);
      await repo.upsertSymbolImportResult({
        runId: input.runId,
        symbol: identity.symbol,
        importType: input.importType,
        status: 'FAILED',
        recordsFound: 0,
        errorMessage: message,
        warnings: [message]
      }).catch(() => undefined);
    }
  }

  return { identities, recordsFound, recordsFailed, documentsDiscovered, announcementsDiscovered, warnings };
}

async function executeCompanyProfiles(runId: string, options: { symbol?: string; symbols?: string[]; limit?: number }): Promise<CseCompanyImportSummary> {
  try {
    const rawPayloads: unknown[] = [];
    const result = await runForSymbols({
      runId,
      importType: 'COMPANY_PROFILE',
      symbols: options.symbol ? [options.symbol] : options.symbols,
      limit: options.limit,
      handler: async (identity) => {
        const fetched = await fetchCompanyProfileFromWorker(identity.symbol);
        const profile = await repo.upsertCompanyProfile(identity, fetched.profile);
        await repo.insertCompanyProfileSnapshot(identity, profile.id, fetched.profile);
        await repo.replaceCompanyPeople(identity, fetched.people, fetched.sourceUrl);
        rawPayloads.push({ symbol: identity.symbol, fetched });
        return { recordsFound: 1, warnings: fetched.warnings };
      }
    });
    const rawFilePath = await writeRunArtifacts(runId, 'company-profiles', rawPayloads);
    const summary: CseCompanyImportSummary = {
      runId,
      status: result.recordsFailed > 0 ? (result.recordsFound > 0 ? 'PARTIAL_SUCCESS' : 'FAILED') : result.warnings.length ? 'PARTIAL_SUCCESS' : 'SUCCESS',
      recordsFound: result.recordsFound,
      recordsFailed: result.recordsFailed,
      warnings: result.warnings,
      rawFilePath
    };
    await finishSimpleRun(runId, summary);
    return summary;
  } finally {
    inProcessCompanyProfiles = false;
  }
}

async function executeFinancialReports(runId: string, options: { symbol?: string; symbols?: string[]; limit?: number }): Promise<CseCompanyImportSummary> {
  try {
    const rawPayloads: unknown[] = [];
    const documentIds: Array<string | null | undefined> = [];
    const result = await runForSymbols({
      runId,
      importType: 'FINANCIAL_REPORTS',
      symbols: options.symbol ? [options.symbol] : options.symbols,
      limit: options.limit,
      handler: async (identity) => {
        const fetched = await fetchFinancialReportsFromWorker(identity.symbol);
        const warnings = [...fetched.warnings];
        let validDocuments = 0;
        for (const report of fetched.reports) {
          const sanitized = sanitizePdfInput(report, warnings, identity.symbol) as CseFinancialReportInput;
          if (sanitized.pdfUrl) validDocuments += 1;
          const saved = await repo.upsertFinancialReport(identity, sanitized);
          documentIds.push(saved.document_id);
        }
        rawPayloads.push({ symbol: identity.symbol, fetched });
        return { recordsFound: fetched.reports.length, documentsDiscovered: validDocuments, warnings };
      }
    });
    await queueDocumentDownloads(documentIds);
    const rawFilePath = await writeRunArtifacts(runId, 'company-financial-reports', rawPayloads);
    const summary: CseCompanyImportSummary = {
      runId,
      status: result.recordsFailed > 0 ? (result.recordsFound > 0 ? 'PARTIAL_SUCCESS' : 'FAILED') : result.warnings.length ? 'PARTIAL_SUCCESS' : 'SUCCESS',
      recordsFound: result.recordsFound,
      recordsFailed: result.recordsFailed,
      documentsDiscovered: result.documentsDiscovered,
      warnings: result.warnings,
      rawFilePath
    };
    await finishSimpleRun(runId, summary);
    return summary;
  } finally {
    inProcessFinancialReports = false;
  }
}

async function executeAnnouncements(runId: string, options: { symbol?: string; symbols?: string[]; startDate: string; endDate: string; limit?: number }): Promise<CseCompanyImportSummary> {
  try {
    const rawPayloads: unknown[] = [];
    const documentIds: Array<string | null | undefined> = [];
    const result = await runForSymbols({
      runId,
      importType: 'ANNOUNCEMENTS',
      symbols: options.symbol ? [options.symbol] : options.symbols,
      limit: options.limit,
      handler: async (identity) => {
        const fetched = await fetchAnnouncementsFromWorker(identity.symbol, options.startDate, options.endDate);
        const warnings = [...fetched.warnings];
        let validDocuments = 0;
        for (const announcement of fetched.announcements) {
          const sanitized = sanitizePdfInput(announcement, warnings, identity.symbol) as CseAnnouncementInput;
          if (sanitized.pdfUrl) validDocuments += 1;
          const saved = await repo.upsertAnnouncement(identity, sanitized, options);
          documentIds.push(saved.document_id);
        }
        rawPayloads.push({ symbol: identity.symbol, fetched });
        return {
          recordsFound: fetched.announcements.length,
          announcementsDiscovered: fetched.announcements.length,
          documentsDiscovered: validDocuments,
          warnings
        };
      }
    });
    await queueDocumentDownloads(documentIds);
    const rawFilePath = await writeRunArtifacts(runId, 'company-announcements', rawPayloads);
    const summary: CseCompanyImportSummary = {
      runId,
      status: result.recordsFailed > 0 ? (result.recordsFound > 0 ? 'PARTIAL_SUCCESS' : 'FAILED') : result.warnings.length ? 'PARTIAL_SUCCESS' : 'SUCCESS',
      recordsFound: result.recordsFound,
      recordsFailed: result.recordsFailed,
      documentsDiscovered: result.documentsDiscovered,
      announcementsDiscovered: result.announcementsDiscovered,
      warnings: result.warnings,
      rawFilePath
    };
    await finishSimpleRun(runId, summary);
    return summary;
  } finally {
    inProcessAnnouncements = false;
  }
}

async function executeLatestPrices(runId: string, options: { insertSnapshot?: boolean; triggerType?: 'manual' | 'scheduled' }): Promise<CseCompanyImportSummary> {
  try {
    const fetched = await fetchLatestPricesFromWorker({ skipWhenMarketClosed: options.triggerType === 'scheduled' });
    const warnings = [...fetched.warnings];
    const isOpen = marketStatusIsOpen(fetched.marketStatus);
    await repo.insertMarketStatusSnapshot({
      status: fetched.marketStatus ?? null,
      isOpen,
      source: fetched.marketStatus ? 'CSE_MARKET_STATUS_API' : 'UNKNOWN',
      rawPayload: (fetched.rawPayload?.marketStatus && typeof fetched.rawPayload.marketStatus === 'object' ? fetched.rawPayload.marketStatus : fetched.rawPayload) as Record<string, unknown>
    }).catch(() => undefined);
    let recordsFound = 0;
    let recordsFailed = 0;
    for (const price of fetched.prices) {
      try {
        const identity = await repo.findCseSecurityBySymbol(price.symbol);
        if (!identity) {
          warnings.push(`${price.symbol}: symbol not found in cse_securities; run A-Z import first.`);
          recordsFailed += 1;
          continue;
        }
        await repo.upsertLatestPrice(identity, price as CseLatestPriceInput, { insertSnapshot: options.insertSnapshot ?? true });
        recordsFound += 1;
        await repo.upsertSymbolImportResult({ runId, symbol: identity.symbol, importType: 'LATEST_PRICES', status: 'SUCCESS', recordsFound: 1 });
      } catch (error) {
        recordsFailed += 1;
        warnings.push(`${price.symbol}: ${error instanceof Error ? error.message : 'Unknown latest price upsert error'}`);
      }
    }
    const rawFilePath = await writeRunArtifacts(runId, 'latest-prices', fetched);
    const summary: CseCompanyImportSummary = {
      runId,
      status: recordsFailed > 0 ? (recordsFound > 0 ? 'PARTIAL_SUCCESS' : 'FAILED') : warnings.length ? 'PARTIAL_SUCCESS' : 'SUCCESS',
      recordsFound,
      recordsFailed,
      warnings,
      rawFilePath
    };
    await finishSimpleRun(runId, summary);
    return summary;
  } finally {
    inProcessLatestPrices = false;
  }
}

function requireValidDateRange(startDate: string, endDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new AppError(400, 'startDate and endDate must be YYYY-MM-DD.');
  }
  if (startDate > endDate) {
    throw new AppError(400, 'startDate must be before or equal to endDate.');
  }
}

export const cseCompanyIntelligenceService = {
  async startCompanyProfilesImport(input?: { symbol?: string; symbols?: string[]; limit?: number; triggerType?: 'manual' | 'scheduled'; parentRunId?: string }) {
    if (!env.CSE_COMPANY_PROFILE_ENABLED) throw new AppError(403, 'CSE Company Profile importer is disabled.');
    if (inProcessCompanyProfiles) throw new AppError(409, 'CSE Company Profile import is already running.');
    inProcessCompanyProfiles = true;
    const triggerType = input?.triggerType ?? 'manual';
    const run = await createFetchRun({ source: 'CSE_COMPANY_PROFILE', sourceUrl: env.CSE_COMPANY_PROFILE_SOURCE_URL, fetchMode: 'python-http', triggerType });
    if (input?.parentRunId) await repo.setFetchRunParentRunId(run.id, input.parentRunId);
    setImmediate(() => executeCompanyProfiles(run.id, { symbol: input?.symbol, symbols: input?.symbols, limit: input?.limit }).catch((error) => console.error('CSE Company Profile import failed', error)));
    return { ok: true, runId: run.id, status: 'RUNNING', triggerType, message: 'CSE Company Profile import started.' };
  },

  async startFinancialReportsImport(input?: { symbol?: string; symbols?: string[]; limit?: number; triggerType?: 'manual' | 'scheduled'; parentRunId?: string }) {
    if (!env.CSE_COMPANY_FINANCIAL_REPORTS_ENABLED) throw new AppError(403, 'CSE Financial Reports importer is disabled.');
    if (inProcessFinancialReports) throw new AppError(409, 'CSE Financial Reports import is already running.');
    inProcessFinancialReports = true;
    const triggerType = input?.triggerType ?? 'manual';
    const run = await createFetchRun({ source: 'CSE_COMPANY_FINANCIAL_REPORTS', sourceUrl: env.CSE_COMPANY_FINANCIAL_REPORTS_API_URL, fetchMode: 'python-http', triggerType });
    if (input?.parentRunId) await repo.setFetchRunParentRunId(run.id, input.parentRunId);
    setImmediate(() => executeFinancialReports(run.id, { symbol: input?.symbol, symbols: input?.symbols, limit: input?.limit }).catch((error) => console.error('CSE Financial Reports import failed', error)));
    return { ok: true, runId: run.id, status: 'RUNNING', triggerType, message: 'CSE Financial Reports import started.' };
  },

  async startAnnouncementsImport(input?: { symbol?: string; symbols?: string[]; startDate?: string; endDate?: string; limit?: number; triggerType?: 'manual' | 'scheduled'; parentRunId?: string }) {
    if (!env.CSE_COMPANY_ANNOUNCEMENTS_ENABLED) throw new AppError(403, 'CSE Announcements importer is disabled.');
    if (inProcessAnnouncements) throw new AppError(409, 'CSE Announcements import is already running.');
    const range = input?.startDate && input?.endDate ? { startDate: input.startDate, endDate: input.endDate } : defaultAnnouncementRange();
    requireValidDateRange(range.startDate, range.endDate);
    inProcessAnnouncements = true;
    const triggerType = input?.triggerType ?? 'manual';
    const run = await createFetchRun({ source: 'CSE_COMPANY_ANNOUNCEMENTS', sourceUrl: env.CSE_COMPANY_ANNOUNCEMENTS_API_URL, fetchMode: 'python-http', triggerType });
    if (input?.parentRunId) await repo.setFetchRunParentRunId(run.id, input.parentRunId);
    setImmediate(() => executeAnnouncements(run.id, { symbol: input?.symbol, symbols: input?.symbols, startDate: range.startDate, endDate: range.endDate, limit: input?.limit }).catch((error) => console.error('CSE Announcements import failed', error)));
    return { ok: true, runId: run.id, status: 'RUNNING', triggerType, startDate: range.startDate, endDate: range.endDate, message: 'CSE Announcements import started.' };
  },

  async startLatestPricesImport(input?: { insertSnapshot?: boolean; triggerType?: 'manual' | 'scheduled'; parentRunId?: string }) {
    if (inProcessLatestPrices) throw new AppError(409, 'CSE Latest Price import is already running.');
    inProcessLatestPrices = true;
    const triggerType = input?.triggerType ?? 'manual';
    const run = await createFetchRun({ source: 'CSE_LATEST_PRICES', sourceUrl: env.CSE_LATEST_PRICE_API_URL, fetchMode: 'python-http', triggerType });
    if (input?.parentRunId) await repo.setFetchRunParentRunId(run.id, input.parentRunId);
    setImmediate(() => executeLatestPrices(run.id, { insertSnapshot: input?.insertSnapshot ?? true, triggerType }).catch((error) => console.error('CSE Latest Price import failed', error)));
    return { ok: true, runId: run.id, status: 'RUNNING', triggerType, message: 'CSE Latest Price import started.' };
  },

  async runLatestPricesImport(input?: { insertSnapshot?: boolean; triggerType?: 'manual' | 'scheduled' }) {
    if (inProcessLatestPrices) throw new AppError(409, 'CSE Latest Price import is already running.');
    inProcessLatestPrices = true;
    const triggerType = input?.triggerType ?? 'manual';
    const run = await createFetchRun({ source: 'CSE_LATEST_PRICES', sourceUrl: env.CSE_LATEST_PRICE_API_URL, fetchMode: 'python-http', triggerType });
    return executeLatestPrices(run.id, { insertSnapshot: input?.insertSnapshot ?? true, triggerType });
  },

  listImportRunSymbolResults(runId: string, params: { status?: string; importType?: CseCompanyImportType; symbol?: string; limit?: number; offset?: number }) {
    return repo.listImportRunSymbolResults(runId, params);
  },

  async retryFailedSymbols(runId: string, input: CseRetryFailedSymbolsInput) {
    const importType = input.importType;
    if (!importType) throw new AppError(400, 'importType is required.');
    const symbols = await repo.listFailedSymbolsForRun(runId, importType, input.limit);
    if (!symbols.length) return { ok: true, runId: null, parentRunId: runId, retryCount: 0, message: 'No failed symbols found for the selected run/import type.' };
    if (importType === 'COMPANY_PROFILE') return this.startCompanyProfilesImport({ symbols, triggerType: 'manual', parentRunId: runId });
    if (importType === 'FINANCIAL_REPORTS') return this.startFinancialReportsImport({ symbols, triggerType: 'manual', parentRunId: runId });
    if (importType === 'ANNOUNCEMENTS') {
      const range = input.startDate && input.endDate ? { startDate: input.startDate, endDate: input.endDate } : defaultAnnouncementRange();
      requireValidDateRange(range.startDate, range.endDate);
      return this.startAnnouncementsImport({ symbols, startDate: range.startDate, endDate: range.endDate, triggerType: 'manual', parentRunId: runId });
    }
    return this.startLatestPricesImport({ insertSnapshot: true, triggerType: 'manual', parentRunId: runId });
  },

  async retryFinancialReportDocument(reportId: string) {
    const result = await repo.retryFinancialReportDocument(reportId);
    await queueDocumentDownloads([result.documentId]);
    return result;
  },

  async retryAnnouncementDocument(announcementId: string) {
    const result = await repo.retryAnnouncementDocument(announcementId);
    await queueDocumentDownloads([result.documentId]);
    return result;
  },

  latestMarketStatus() {
    return repo.latestMarketStatusSnapshot();
  },

  listCompanyProfiles(params: { limit?: number; search?: string }) {
    return repo.listCompanyProfiles(params);
  },

  async getCompanyIntelligence(symbol: string) {
    const result = await repo.getCompanyIntelligence(symbol);
    if (!result.profile) throw new AppError(404, 'CSE company profile not found. Run company profile import for this symbol first.');
    return result;
  },

  listFinancialReports(symbol: string) {
    return repo.listFinancialReportsBySymbol(symbol);
  },

  listAllFinancialReports(params: { symbol?: string; reportType?: string; financialYear?: string; documentStatus?: string; limit?: number; search?: string }) {
    return repo.listFinancialReports(params);
  },

  listAnnouncements(symbol: string, params: { startDate?: string; endDate?: string }) {
    return repo.listAnnouncementsBySymbol(symbol, params);
  },

  listAllAnnouncements(params: { symbol?: string; startDate?: string; endDate?: string; category?: string; documentStatus?: string; limit?: number; search?: string }) {
    return repo.listAnnouncements(params);
  },

  getLatestPrice(symbol: string) {
    return repo.getLatestPriceBySymbol(symbol);
  },

  listLatestPrices(params: { limit?: number; search?: string }) {
    return repo.listLatestPrices(params);
  }
};
