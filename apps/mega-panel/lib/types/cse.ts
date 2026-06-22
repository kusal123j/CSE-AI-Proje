export type CseFetchRunStatus = 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED' | 'RUNNING' | string;
export type CseSystemStatus = 'Healthy' | 'Warning' | 'Failed' | 'Unknown';
export type LetterStatus = 'Pending' | 'Downloading' | 'Downloaded' | 'Parsed' | 'Failed' | 'Skipped' | 'Unknown';

export interface CseFetchRun {
  id: string;
  source?: string;
  source_url?: string;
  fetch_mode?: string;
  status: CseFetchRunStatus;
  started_at?: string | null;
  finished_at?: string | null;
  records_found?: number | null;
  companies_created?: number | null;
  companies_updated?: number | null;
  securities_created?: number | null;
  securities_updated?: number | null;
  snapshots_created?: number | null;
  snapshots_updated?: number | null;
  records_failed?: number | null;
  error_message?: string | null;
  warnings_json?: string[] | string | null;
  raw_file_path?: string | null;
  letters_attempted?: number | null;
  letters_successful?: number | null;
  letters_failed?: number | null;
  records_before_deduplication?: number | null;
  records_deduplicated?: number | null;
  created_at?: string | null;
  validation_report?: {
    letterResults?: Array<{ letter: string; status: string; rowCount?: number; attempts?: number | null; error?: string | null }>;
    failedLetters?: Array<{ letter: string; error: string; attempts?: number }>;
    emptyLetters?: string[];
    errors?: string[];
  } | null;
}

export interface CseImportConfig {
  mode: 'python-http' | string;
  schedulerEnabled: boolean;
  realTimeProgressAvailable: boolean;
  weekdaysOnly?: boolean;
  scheduledHour?: number;
  scheduledMinute?: number;
  requiredLetters?: string[];
  jobTimeoutSeconds?: number;
  letterTimeoutSeconds?: number;
  maxRetries?: number;
  artifactStorageDir?: string;
  staleAfterHours?: number;
  lastSuccessfulImportAt?: string | null;
  gics?: CseGicsImportConfig;
  dailyMarketSummary?: CseDailyMarketSummaryConfig;
  tradeSummary?: {
    enabled: boolean;
    source: string;
    sourceUrl: string;
    fetchGranularity: string;
    directApiExportAllowed: boolean;
    csvFallbackConfigured: boolean;
    csvDiscoveryEnabled?: boolean;
    htmlFallbackEnabled?: boolean;
    browserAutomationEnabled: boolean;
    playwrightEnabled: boolean;
    schedulerEnabled: boolean;
    weekdaysOnly?: boolean;
    scheduledHour?: number;
    scheduledMinute?: number;
    timeoutSeconds?: number;
    minExpectedRows?: number;
    artifactStorageDir?: string;
  };
}

export interface CseRawRunSummary {
  runId: string;
  available: boolean;
  rawFilePath?: string | null;
  files?: Array<{
    name: string;
    path: string;
    extension?: string;
    sizeBytes?: number;
    modifiedAt?: string;
    letter?: string | null;
    type?: string;
  }>;
  mergedNormalizedJsonPath?: string | null;
  warnings?: string[];
  parseErrors?: string[];
  failedRows?: unknown[];
  dbArtifacts?: Array<{ letter?: string | null; artifact_type?: string; row_count?: number | null; file_path?: string; checksum?: string | null }>;
  validationReport?: CseFetchRun['validation_report'];
  reason?: string;
}

export interface CseCompany {
  id: string;
  name: string;
  normalized_name?: string;
  profile_url?: string | null;
  logo_url?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  is_active?: boolean;
  security_count?: number | string | null;
}

export interface CseSecurity {
  id: string;
  company_id?: string;
  symbol: string;
  normalized_symbol?: string;
  company_name?: string | null;
  logo_url?: string | null;
  profile_url?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  is_active?: boolean;
  latest_snapshot_date?: string | null;
  last_traded_price?: number | string | null;
  previous_close?: number | string | null;
  open_price?: number | string | null;
  high_price?: number | string | null;
  low_price?: number | string | null;
  is_watch_list?: boolean | string | null;
  trade_volume?: number | string | null;
  share_volume?: number | string | null;
  turnover?: number | string | null;
  change_amount?: number | string | null;
  change_percent?: number | string | null;
}

export interface CseDailySnapshot {
  id: string;
  security_id?: string;
  symbol: string;
  trading_date?: string;
  company_name?: string | null;
  logo_url?: string | null;
  profile_url?: string | null;
  last_traded_price?: number | string | null;
  previous_close?: number | string | null;
  open_price?: number | string | null;
  high_price?: number | string | null;
  low_price?: number | string | null;
  is_watch_list?: boolean | string | null;
  market_timestamp?: string | null;
  source_market_timestamp_text?: string | null;
  trade_volume?: number | string | null;
  share_volume?: number | string | null;
  turnover?: number | string | null;
  change_amount?: number | string | null;
  change_percent?: number | string | null;
  source_page?: string | null;
  source_letter?: string | null;
  raw_row?: Record<string, unknown> | null;
  fetched_at?: string | null;
}

export type CseMarketRankingItem = CseDailySnapshot;

export interface CseMarketBreadthSummary {
  tradingDate: string | null;
  gainersCount: number;
  losersCount: number;
  unchangedCount: number;
  watchListCount: number;
  activeSecuritiesCount: number;
  totalShareVolume: number;
  totalTradeVolume: number;
}


export interface AzLetterProgress {
  letter: string;
  status: LetterStatus;
  message?: string;
}


export interface CseFreshnessMeta {
  lastImportedAt: string | null;
  lastSuccessfulImportId: string | null;
  source: string;
  sourceUrl: string;
  mode: string;
  isStale: boolean;
  staleAfterHours: number;
}

export interface CseDataResponse<T> {
  data: T;
  meta: CseFreshnessMeta;
}

export interface CseGicsImportConfig {
  enabled: boolean;
  source: string;
  summaryUrl: string;
  indicesUrl: string;
  classificationUrl: string;
  fetchMode: string;
  csvDownloadPreferred: boolean;
  htmlFallbackEnabled: boolean;
  browserAutomationEnabled: boolean;
  playwrightEnabled: boolean;
  schedulerEnabled: boolean;
  minExpectedGroups: number;
  minExpectedClassificationRows: number;
  timeoutSeconds?: number;
  artifactStorageDir?: string;
}

export interface CseGicsDashboard {
  groupCount: number;
  classificationCount: number;
  unmappedCount: number;
  latestSummaryDate: string | null;
  latestIndexDate: string | null;
}

export interface CseGicsGroup {
  id: string;
  industry_group_code: string;
  gics_code: string;
  symbol: string;
  industry_group_name: string;
  is_active?: boolean;
}

export interface CseGicsSummaryRow {
  industry_group_name?: string | null;
  industry_group_code: string;
  gics_code?: string | null;
  index_code?: string | null;
  trading_date?: string | null;
  index_value?: number | string | null;
  turnover_value?: number | string | null;
  turnover_volume?: number | string | null;
  trade_volume?: number | string | null;
  per?: number | string | null;
  pbv?: number | string | null;
  dy?: number | string | null;
  companies_traded?: number | string | null;
  companies_listed?: number | string | null;
}

export interface CseGicsIndexRow {
  industry_group_name: string;
  index_code: string;
  gics_code?: string | null;
  trading_date?: string | null;
  today_index?: number | string | null;
  previous_index?: number | string | null;
  index_change?: number | string | null;
  index_change_percent?: number | string | null;
  turnover_value?: number | string | null;
  turnover_volume?: number | string | null;
  trades?: number | string | null;
}

export interface CseGicsClassificationRow {
  company_name: string;
  symbol: string;
  normalized_symbol: string;
  industry_group_name: string;
  industry_group_code?: string | null;
  gics_code?: string | null;
  is_mapped?: boolean;
  last_seen_at?: string | null;
}

export interface CseDailyMarketSummaryConfig {
  enabled: boolean;
  source: string;
  sourceUrl: string;
  fetchMode: string;
  fetchStrategy: string;
  htmlFallbackEnabled: boolean;
  browserAutomationEnabled: boolean;
  playwrightEnabled: boolean;
  schedulerEnabled: boolean;
  weekdaysOnly?: boolean;
  scheduledHour?: number;
  scheduledMinute?: number;
  timeoutSeconds?: number;
  artifactStorageDir?: string;
}

export interface CseDailyMarketSummaryCalculatedMetrics {
  aspiChange?: number | string | null;
  aspiChangePercent?: number | string | null;
  spSl20Change?: number | string | null;
  spSl20ChangePercent?: number | string | null;
  foreignNetFlow?: number | string | null;
  domesticNetFlow?: number | string | null;
  turnoverChange?: number | string | null;
  turnoverChangePercent?: number | string | null;
  marketCapChange?: number | string | null;
  marketCapChangePercent?: number | string | null;
  tradedCompanyParticipationPercent?: number | string | null;
}

export interface CseDailyMarketSummary {
  id?: string;
  trading_date?: string | null;
  tradingDate?: string | null;
  source_url?: string | null;
  sourceUrl?: string | null;
  source_as_of_text?: string | null;
  sourceAsOfText?: string | null;
  fetch_mode?: string | null;
  fetchMode?: string | null;
  fetch_strategy?: string | null;
  fetchStrategy?: string | null;
  checksum?: string | null;
  warnings_json?: string[] | string | null;
  warnings?: string[] | string | null;
  validation_report?: Record<string, unknown> | null;
  validationReport?: Record<string, unknown> | null;
  calculated?: CseDailyMarketSummaryCalculatedMetrics;

  aspi_today?: number | string | null;
  aspi_previous?: number | string | null;
  sp_sl20_today?: number | string | null;
  sp_sl20_previous?: number | string | null;
  equity_turnover_today?: number | string | null;
  equity_turnover_previous?: number | string | null;
  foreign_purchases_today?: number | string | null;
  foreign_sales_today?: number | string | null;
  domestic_purchases_today?: number | string | null;
  domestic_sales_today?: number | string | null;
  market_cap_today?: number | string | null;
  market_per_today?: number | string | null;
  market_pbv_today?: number | string | null;
  market_dy_today?: number | string | null;
}

export interface CseCompanyProfileRow {
  id: string;
  symbol: string;
  company_name: string;
  isin?: string | null;
  logo_url?: string | null;
  gics_industry_group?: string | null;
  board?: string | null;
  last_profile_fetched_at?: string | null;
  last_traded_price?: number | string | null;
  change_amount?: number | string | null;
  change_percent?: number | string | null;
  latest_price_updated_at?: string | null;
  report_count?: number | string | null;
  announcement_count?: number | string | null;
}

export interface CseCompanyProfileDetail {
  profile: CseCompanyProfileRow & {
    business_summary?: string | null;
    founded_year?: number | string | null;
    quoted_date?: string | null;
    financial_year_end?: string | null;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
    fax?: string | null;
    website?: string | null;
    company_secretaries?: string | null;
    auditors?: string | null;
    articles_of_association_url?: string | null;
  };
  people: CseCompanyPerson[];
  financialReports: CseCompanyFinancialReport[];
  announcements: CseCompanyAnnouncement[];
  latestPrice: CseLatestPrice | null;
}

export interface CseCompanyPerson {
  id: string;
  person_name: string;
  designation?: string | null;
  role_group?: string | null;
  is_current?: boolean;
}

export interface CseCompanyFinancialReport {
  id: string;
  symbol: string;
  report_type: string;
  title: string;
  financial_year?: string | null;
  period?: string | null;
  published_date?: string | null;
  pdf_url?: string | null;
  original_pdf_url?: string | null;
  source_url?: string | null;
  document_id?: string | null;
  download_status?: string | null;
  extract_status?: string | null;
  auto_download_eligible?: boolean | string | null;
  auto_download_reason?: string | null;
  company_name?: string | null;
  document_status?: string | null;
  document_error?: string | null;
}

export interface CseCompanyAnnouncement {
  id: string;
  symbol: string;
  announcement_title: string;
  announcement_category?: string | null;
  published_at?: string | null;
  published_date?: string | null;
  pdf_url?: string | null;
  original_pdf_url?: string | null;
  source_url?: string | null;
  document_id?: string | null;
  auto_download_eligible?: boolean | string | null;
  auto_download_reason?: string | null;
  company_name?: string | null;
  document_status?: string | null;
  document_error?: string | null;
}

export interface CseLatestPrice {
  id: string;
  symbol: string;
  company_name?: string | null;
  last_traded_price?: number | string | null;
  change_amount?: number | string | null;
  change_percent?: number | string | null;
  previous_close?: number | string | null;
  open_price?: number | string | null;
  high_price?: number | string | null;
  low_price?: number | string | null;
  turnover?: number | string | null;
  share_volume?: number | string | null;
  trade_volume?: number | string | null;
  market_cap?: number | string | null;
  market_status?: string | null;
  trade_time?: string | null;
  updated_at?: string | null;
}

export interface CseImportRunSymbolResult {
  id: string;
  run_id: string;
  symbol: string;
  import_type: string;
  status: string;
  records_found?: number | string | null;
  documents_discovered?: number | string | null;
  announcements_discovered?: number | string | null;
  error_message?: string | null;
  warnings_json?: string[] | string | null;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface CseImportRunSymbolResultsResponse {
  runId: string;
  summary: {
    total: number | string;
    success: number | string;
    failed: number | string;
    warning: number | string;
    skipped: number | string;
  };
  items: CseImportRunSymbolResult[];
}

export interface CseMarketStatusSnapshot {
  id: string;
  status?: string | null;
  is_open?: boolean | null;
  source?: string | null;
  checked_at?: string | null;
  created_at?: string | null;
}
