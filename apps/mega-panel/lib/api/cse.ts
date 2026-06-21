import { toQueryString } from '@/lib/utils';
import type { CseDashboardSummary } from '@/lib/types/dashboard';
import type {
  CseCompany,
  CseDailySnapshot,
  CseDailyMarketSummary,
  CseDataResponse,
  CseFetchRun,
  CseGicsClassificationRow,
  CseGicsDashboard,
  CseGicsGroup,
  CseGicsIndexRow,
  CseGicsSummaryRow,
  CseImportConfig,
  CseMarketBreadthSummary,
  CseMarketRankingItem,
  CseRawRunSummary,
  CseSecurity
} from '@/lib/types/cse';
import { apiFetch, panelFetch } from './client';


function unwrapData<T>(response: T[] | CseDataResponse<T[]>): T[] {
  if (Array.isArray(response)) return response;
  return response.data;
}

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

export function runTradeSummaryImport(input?: { tradingDate?: string }) {
  return panelFetch<unknown>('/api/cse/import/trade-summary/run', {
    method: 'POST',
    body: JSON.stringify(input ?? {})
  });
}

export function runGicsImport(input?: { tradingDate?: string }) {
  return panelFetch<unknown>('/api/cse/import/gics/run', {
    method: 'POST',
    body: JSON.stringify(input ?? {})
  });
}

export function runDailyMarketSummaryImport(input?: { tradingDate?: string }) {
  return panelFetch<unknown>('/api/cse/import/daily-market-summary/run', {
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
  return apiFetch<CseCompany[] | CseDataResponse<CseCompany[]>>(`companies${toQueryString(params)}`).then(unwrapData);
}

export function getSecurities(params?: ListParams) {
  return apiFetch<CseSecurity[] | CseDataResponse<CseSecurity[]>>(`securities${toQueryString(params)}`).then(unwrapData);
}

export function getDailySnapshots(params?: ListParams) {
  return apiFetch<CseDailySnapshot[] | CseDataResponse<CseDailySnapshot[]>>(`market/daily${toQueryString(params)}`).then(unwrapData);
}

export function getMarketGainers(params?: ListParams) {
  return apiFetch<CseMarketRankingItem[] | CseDataResponse<CseMarketRankingItem[]>>(`market/gainers${toQueryString(params)}`).then(unwrapData);
}

export function getMarketLosers(params?: ListParams) {
  return apiFetch<CseMarketRankingItem[] | CseDataResponse<CseMarketRankingItem[]>>(`market/losers${toQueryString(params)}`).then(unwrapData);
}

export function getTopTurnover(params?: ListParams) {
  return apiFetch<CseMarketRankingItem[] | CseDataResponse<CseMarketRankingItem[]>>(`market/top-turnover${toQueryString(params)}`).then(unwrapData);
}

export function getTopTradeVolume(params?: ListParams) {
  return apiFetch<CseMarketRankingItem[] | CseDataResponse<CseMarketRankingItem[]>>(`market/top-trade-volume${toQueryString(params)}`).then(unwrapData);
}

export function getTopShareVolume(params?: ListParams) {
  return apiFetch<CseMarketRankingItem[] | CseDataResponse<CseMarketRankingItem[]>>(`market/top-share-volume${toQueryString(params)}`).then(unwrapData);
}

export function getWatchListMovers(params?: ListParams) {
  return apiFetch<CseMarketRankingItem[] | CseDataResponse<CseMarketRankingItem[]>>(`market/watch-list-movers${toQueryString(params)}`).then(unwrapData);
}

export function getMarketBreadth(params?: Pick<ListParams, 'date'>) {
  return apiFetch<CseMarketBreadthSummary | CseDataResponse<CseMarketBreadthSummary>>(`market/breadth${toQueryString(params)}`).then((response) => ('data' in response ? response.data : response));
}

export function getGicsDashboard() {
  return apiFetch<CseGicsDashboard>('gics/dashboard');
}

export function getGicsGroups() {
  return apiFetch<CseGicsGroup[]>('gics/groups');
}

export function getGicsSummary(params?: Pick<ListParams, 'limit'>) {
  return apiFetch<CseGicsSummaryRow[]>(`gics/summary${toQueryString(params)}`);
}

export function getGicsIndices(params?: Pick<ListParams, 'limit'>) {
  return apiFetch<CseGicsIndexRow[]>(`gics/indices${toQueryString(params)}`);
}

export function getGicsClassifications(params?: Pick<ListParams, 'limit' | 'search'>) {
  return apiFetch<CseGicsClassificationRow[]>(`gics/classifications${toQueryString(params)}`);
}

export function getLatestDailyMarketSummary() {
  return apiFetch<CseDailyMarketSummary | null>('daily-market-summary/latest');
}

export function getDailyMarketSummaryHistory(params?: Pick<ListParams, 'limit'> & { from?: string; to?: string }) {
  return apiFetch<CseDailyMarketSummary[]>(`daily-market-summary/history${toQueryString(params)}`);
}
