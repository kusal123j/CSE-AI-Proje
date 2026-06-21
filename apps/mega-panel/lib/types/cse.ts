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
