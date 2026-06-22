import axios from 'axios';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import {
  assertCseAnnouncementApiUrl,
  assertCseCompanyProfileUrl,
  assertCseFinancialReportsApiUrl,
  assertCseLatestPriceApiUrl
} from './cse.sourceGuard';
import {
  FetchAnnouncementsResult,
  FetchCompanyProfileResult,
  FetchFinancialReportsResult,
  FetchLatestPricesResult
} from './cse.companyIntelligence.types';

function pythonImporterErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (detail && typeof detail === 'object' && 'message' in detail) return String(detail.message);
    if (typeof detail === 'string') return detail;
    return error.message;
  }
  return error instanceof Error ? error.message : 'Unknown Python CSE company-intelligence importer error';
}

function assertFetchMode(response: { fetchMode?: string }, label: string) {
  if (response.fetchMode !== 'python-http') {
    throw new AppError(502, `${label} returned unsupported fetch mode: ${String(response.fetchMode)}`);
  }
}

function validateProfileResponse(value: unknown): FetchCompanyProfileResult {
  const response = value as Partial<FetchCompanyProfileResult>;
  if (!response || typeof response !== 'object' || !response.profile || typeof response.profile !== 'object') {
    throw new AppError(502, 'Python CSE Company Profile importer returned an invalid response body.');
  }
  assertFetchMode(response, 'Python CSE Company Profile importer');
  if (!response.profile.symbol || !response.profile.companyName || !response.profile.sourceUrl) {
    throw new AppError(502, 'Python CSE Company Profile importer did not return symbol, companyName, and sourceUrl.');
  }
  return {
    ...response,
    warnings: response.warnings ?? [],
    people: response.people ?? [],
    rawPayload: response.rawPayload ?? {},
    fetchStrategy: response.fetchStrategy ?? 'api-first-html-fallback',
    sourceUrl: response.sourceUrl ?? response.profile.sourceUrl
  } as FetchCompanyProfileResult;
}

function validateReportsResponse(value: unknown): FetchFinancialReportsResult {
  const response = value as Partial<FetchFinancialReportsResult>;
  if (!response || typeof response !== 'object' || !Array.isArray(response.reports)) {
    throw new AppError(502, 'Python CSE Financial Reports importer returned an invalid response body.');
  }
  assertFetchMode(response, 'Python CSE Financial Reports importer');
  return {
    ...response,
    warnings: response.warnings ?? [],
    rawPayload: response.rawPayload ?? {},
    fetchStrategy: response.fetchStrategy ?? 'api-first-html-fallback',
    sourceUrl: response.sourceUrl ?? env.CSE_COMPANY_FINANCIAL_REPORTS_API_URL
  } as FetchFinancialReportsResult;
}

function validateAnnouncementsResponse(value: unknown): FetchAnnouncementsResult {
  const response = value as Partial<FetchAnnouncementsResult>;
  if (!response || typeof response !== 'object' || !Array.isArray(response.announcements)) {
    throw new AppError(502, 'Python CSE Announcements importer returned an invalid response body.');
  }
  assertFetchMode(response, 'Python CSE Announcements importer');
  return {
    ...response,
    warnings: response.warnings ?? [],
    rawPayload: response.rawPayload ?? {},
    fetchStrategy: response.fetchStrategy ?? 'api-first-html-fallback',
    sourceUrl: response.sourceUrl ?? env.CSE_COMPANY_ANNOUNCEMENTS_API_URL
  } as FetchAnnouncementsResult;
}

function validateLatestPricesResponse(value: unknown): FetchLatestPricesResult {
  const response = value as Partial<FetchLatestPricesResult>;
  if (!response || typeof response !== 'object' || !Array.isArray(response.prices)) {
    throw new AppError(502, 'Python CSE Latest Price importer returned an invalid response body.');
  }
  assertFetchMode(response, 'Python CSE Latest Price importer');
  return {
    ...response,
    warnings: response.warnings ?? [],
    rawPayload: response.rawPayload ?? {},
    fetchStrategy: response.fetchStrategy ?? 'bulk-api-primary',
    sourceUrl: response.sourceUrl ?? env.CSE_LATEST_PRICE_API_URL
  } as FetchLatestPricesResult;
}

export async function fetchCompanyProfileFromWorker(symbol: string): Promise<FetchCompanyProfileResult> {
  const sourceUrl = `${env.CSE_COMPANY_PROFILE_SOURCE_URL}?symbol=${encodeURIComponent(symbol)}`;
  assertCseCompanyProfileUrl(sourceUrl);
  try {
    const { data } = await axios.post(
      `${env.PYTHON_WORKER_URL}/cse/import/company-profile`,
      { symbol, sourceUrl, apiUrl: env.CSE_COMPANY_PROFILE_API_URL },
      { timeout: env.CSE_COMPANY_PROFILE_TIMEOUT_SECONDS * 1000 }
    );
    return validateProfileResponse(data);
  } catch (error) {
    throw new AppError(502, `CSE Company Profile Python importer failed: ${pythonImporterErrorMessage(error)}`);
  }
}

export async function fetchFinancialReportsFromWorker(symbol: string): Promise<FetchFinancialReportsResult> {
  assertCseFinancialReportsApiUrl(env.CSE_COMPANY_FINANCIAL_REPORTS_API_URL);
  try {
    const { data } = await axios.post(
      `${env.PYTHON_WORKER_URL}/cse/import/company-financials`,
      { symbol, apiUrl: env.CSE_COMPANY_FINANCIAL_REPORTS_API_URL },
      { timeout: env.CSE_COMPANY_FINANCIAL_REPORTS_TIMEOUT_SECONDS * 1000 }
    );
    return validateReportsResponse(data);
  } catch (error) {
    throw new AppError(502, `CSE Financial Reports Python importer failed: ${pythonImporterErrorMessage(error)}`);
  }
}

export async function fetchAnnouncementsFromWorker(symbol: string, startDate: string, endDate: string): Promise<FetchAnnouncementsResult> {
  assertCseAnnouncementApiUrl(env.CSE_COMPANY_ANNOUNCEMENTS_API_URL);
  try {
    const { data } = await axios.post(
      `${env.PYTHON_WORKER_URL}/cse/import/company-announcements`,
      { symbol, startDate, endDate, apiUrl: env.CSE_COMPANY_ANNOUNCEMENTS_API_URL },
      { timeout: env.CSE_COMPANY_ANNOUNCEMENTS_TIMEOUT_SECONDS * 1000 }
    );
    return validateAnnouncementsResponse(data);
  } catch (error) {
    throw new AppError(502, `CSE Announcements Python importer failed: ${pythonImporterErrorMessage(error)}`);
  }
}

export async function fetchLatestPricesFromWorker(options?: { skipWhenMarketClosed?: boolean }): Promise<FetchLatestPricesResult> {
  assertCseLatestPriceApiUrl(env.CSE_LATEST_PRICE_API_URL);
  try {
    const { data } = await axios.post(
      `${env.PYTHON_WORKER_URL}/cse/import/latest-prices`,
      { apiUrl: env.CSE_LATEST_PRICE_API_URL, marketStatusUrl: env.CSE_MARKET_STATUS_API_URL, skipWhenMarketClosed: options?.skipWhenMarketClosed === true },
      { timeout: env.CSE_LATEST_PRICE_TIMEOUT_SECONDS * 1000 }
    );
    return validateLatestPricesResponse(data);
  } catch (error) {
    throw new AppError(502, `CSE Latest Price Python importer failed: ${pythonImporterErrorMessage(error)}`);
  }
}
