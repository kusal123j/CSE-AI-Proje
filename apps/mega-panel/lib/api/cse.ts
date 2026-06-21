import { toQueryString } from '@/lib/utils';
import type { CseDashboardSummary } from '@/lib/types/dashboard';
import type {
  CseCompany,
  CseDailySnapshot,
  CseFetchRun,
  CseImportConfig,
  CseMarketRankingItem,
  CseRawRunSummary,
  CseSecurity
} from '@/lib/types/cse';
import { apiFetch, panelFetch } from './client';

export interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
  date?: string;
}

export function getDashboardSummary() {
  return apiFetch<CseDashboardSummary>('summary');
}

export function getCseImportConfig() {
  return apiFetch<CseImportConfig>('import/config');
}

export function runCseImport(input?: { tradingDate?: string }) {
  return panelFetch<unknown>('/api/cse/import/run', {
    method: 'POST',
    body: JSON.stringify(input ?? {})
  });
}

export function getCseFetchRuns(params?: Pick<ListParams, 'limit'>) {
  return apiFetch<CseFetchRun[]>(`import/runs${toQueryString(params)}`);
}

export function getCseFetchRunDetails(id: string) {
  return apiFetch<CseFetchRun>(`import/runs/${encodeURIComponent(id)}`);
}

export function getRawRunSummary(id: string) {
  return apiFetch<CseRawRunSummary>(`import/runs/${encodeURIComponent(id)}/raw-summary`);
}

export function getCompanies(params?: ListParams) {
  return apiFetch<CseCompany[]>(`companies${toQueryString(params)}`);
}

export function getSecurities(params?: ListParams) {
  return apiFetch<CseSecurity[]>(`securities${toQueryString(params)}`);
}

export function getDailySnapshots(params?: ListParams) {
  return apiFetch<CseDailySnapshot[]>(`market/daily${toQueryString(params)}`);
}

export function getMarketGainers(params?: ListParams) {
  return apiFetch<CseMarketRankingItem[]>(`market/gainers${toQueryString(params)}`);
}

export function getMarketLosers(params?: ListParams) {
  return apiFetch<CseMarketRankingItem[]>(`market/losers${toQueryString(params)}`);
}

export function getTopTurnover(params?: ListParams) {
  return apiFetch<CseMarketRankingItem[]>(`market/top-turnover${toQueryString(params)}`);
}

export function getTopTradeVolume(params?: ListParams) {
  return apiFetch<CseMarketRankingItem[]>(`market/top-trade-volume${toQueryString(params)}`);
}

export function getTopShareVolume(params?: ListParams) {
  return apiFetch<CseMarketRankingItem[]>(`market/top-share-volume${toQueryString(params)}`);
}
