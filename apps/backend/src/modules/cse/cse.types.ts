export type CseFetchMode = 'python-http';

export interface ParsedCseAlphabeticalRow {
  companyName: string;
  normalizedCompanyName: string;
  symbol: string;
  normalizedSymbol: string;
  board?: string | null;
  sector?: string | null;
  profileUrl: string | null;
  logoUrl: string | null;
  lastTradedPrice: number | null;
  tradeVolume: number | null;
  shareVolume: number | null;
  turnover: number | null;
  marketCapitalization?: number | null;
  changeAmount: number | null;
  changePercent: number | null;
  sourceLetter?: string;
  rawRow: Record<string, unknown>;
}

export interface CseDownloadedLetterFile {
  letter: string;
  filePath: string;
  suggestedFilename: string;
  contentType?: string | null;
}

export interface CseLetterFailure {
  letter: string;
  error: string;
  attempts?: number;
}

export interface CseLetterArtifact {
  letter: string;
  filePath: string;
  suggestedFilename: string;
  contentType?: string | null;
  checksum?: string | null;
  rowCount?: number | null;
  status?: 'success' | 'failed' | 'empty';
  attempts?: number | null;
  lastError?: string | null;
}

export interface CseLetterValidationDetail {
  letter: string;
  status: 'success' | 'failed' | 'empty' | 'unknown';
  rowCount: number;
  attempts?: number | null;
  error?: string | null;
}

export interface CseImportValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  uniqueCompanyCount: number;
  uniqueSymbolCount: number;
  rawRowCount: number;
  duplicateSymbols: string[];
  lettersAttempted: number;
  lettersSuccessful: number;
  lettersFailed: number;
  failedLetters: CseLetterFailure[];
  emptyLetters: string[];
  letterResults: CseLetterValidationDetail[];
  thresholds: {
    minCompanies: number;
    minSecurities: number;
    minExpectedRows: number;
  };
  promotionAllowed: boolean;
}

export interface FetchAlphabeticalResult {
  rows: ParsedCseAlphabeticalRow[];
  rawContent: string;
  fetchMode: CseFetchMode;
  sourceUrl: string;
  warnings: string[];
  rawStoragePath: string;
  downloadedFiles: CseDownloadedLetterFile[];
  rawArtifacts?: CseLetterArtifact[];
  letterResults?: CseLetterValidationDetail[];
  lettersAttempted: number;
  lettersSuccessful: number;
  lettersFailed: number;
  failedLetters: CseLetterFailure[];
  recordsBeforeDeduplication: number;
  recordsDeduplicated: number;
  duplicateSymbols?: string[];
  validationReport?: CseImportValidationReport;
}


export interface ParsedCseTradeSummaryRow {
  companyName: string;
  normalizedCompanyName: string;
  symbol: string;
  normalizedSymbol: string;
  shareVolume: number | null;
  tradeVolume: number | null;
  previousClose: number | null;
  openPrice: number | null;
  highPrice: number | null;
  lowPrice: number | null;
  lastTradedPrice: number | null;
  turnover?: number | null;
  changeAmount: number | null;
  changePercent: number | null;
  isWatchList: boolean;
  watchListDetectionSource?: string | null;
  rawRow: Record<string, unknown>;
}

export interface FetchTradeSummaryResult {
  rows: ParsedCseTradeSummaryRow[];
  rawContent: string;
  fetchMode: CseFetchMode;
  fetchStrategy: 'api' | 'csv' | 'html' | string;
  sourceUrl: string;
  warnings: string[];
  rawStoragePath: string;
  rawArtifactPath: string;
  checksum?: string | null;
  marketTimestamp?: string | null;
  sourceMarketTimestampText?: string | null;
  recordsBeforeDeduplication: number;
  recordsDeduplicated: number;
  duplicateSymbols?: string[];
}

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

export interface CseImportResult {
  runId: string;
  status: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED';
  recordsFound: number;
  recordsBeforeDeduplication?: number;
  recordsDeduplicated?: number;
  companiesCreated: number;
  companiesUpdated: number;
  securitiesCreated: number;
  securitiesUpdated: number;
  snapshotsCreated: number;
  snapshotsUpdated: number;
  recordsFailed: number;
  warnings: string[];
  rawFilePath?: string | null;
  rawStoragePath?: string | null;
  tradingDate: string;
  fetchMode?: CseFetchMode;
  lettersAttempted?: number;
  lettersSuccessful?: number;
  lettersFailed?: number;
  failedLetters?: CseLetterFailure[];
  validationReport?: CseImportValidationReport;
}

export interface CseImportStartResult {
  ok: true;
  runId: string;
  status: 'RUNNING';
  triggerType: 'manual' | 'scheduled';
  tradingDate: string;
  message: string;
}

export interface CseFreshnessMeta {
  lastImportedAt: string | null;
  lastSuccessfulImportId: string | null;
  source: string;
  sourceUrl: string;
  mode: CseFetchMode;
  isStale: boolean;
  staleAfterHours: number;
}

export interface CseDataResponse<T> {
  data: T;
  meta: CseFreshnessMeta;
}

export interface CseListQuery {
  page?: number;
  limit?: number;
  search?: string;
  date?: string;
}

export interface ParsedCseGicsIndustryGroupRow {
  industryGroupCode: string;
  gicsCode: string;
  symbol: string;
  industryGroupName: string;
  rawRow: Record<string, unknown>;
}

export interface ParsedCseGicsSummaryRow {
  industryGroupCode: string;
  indexCode: string;
  indexValue: number | null;
  turnoverValue: number | null;
  turnoverVolume: number | null;
  tradeVolume: number | null;
  per: number | null;
  pbv: number | null;
  dy: number | null;
  companiesTraded: number | null;
  companiesListed: number | null;
  rawRow: Record<string, unknown>;
}

export interface ParsedCseGicsIndexRow {
  industryGroupName: string;
  indexCode: string;
  gicsCode: string;
  todayIndex: number | null;
  previousIndex: number | null;
  indexChange: number | null;
  indexChangePercent: number | null;
  turnoverValue: number | null;
  turnoverVolume: number | null;
  trades: number | null;
  rawRow: Record<string, unknown>;
}

export interface ParsedCseGicsClassificationRow {
  companyName: string;
  normalizedCompanyName: string;
  symbol: string;
  normalizedSymbol: string;
  industryGroupName: string;
  lastTradedTime: string | null;
  lastTradedPrice: number | null;
  tradeVolume: number | null;
  shareVolume: number | null;
  turnover: number | null;
  changeAmount: number | null;
  changePercent: number | null;
  ytdChangePercent: number | null;
  rawRow: Record<string, unknown>;
}

export interface CseGicsValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  summaryRowCount: number;
  industryGroupCount: number;
  indicesRowCount: number;
  classificationRowCount: number;
  groupsAttempted: number;
  groupsSuccessful: number;
  groupsFailed: number;
  duplicateSymbols: string[];
  unmappedSymbols?: string[];
  thresholds: {
    minExpectedGroups: number;
    minExpectedClassificationRows: number;
  };
  promotionAllowed: boolean;
}

export interface FetchGicsResult {
  sourceUrl: string;
  summaryUrl: string;
  indicesUrl: string;
  classificationUrl: string;
  fetchMode: CseFetchMode;
  warnings: string[];
  rawContent: string;
  rawStoragePath: string;
  rawArtifactPaths: {
    summaryRaw: string;
    indicesRaw: string;
    classificationRaw: string;
    summaryNormalized: string;
    indicesNormalized: string;
    classificationNormalized: string;
    importReport: string;
  };
  summaryRows: ParsedCseGicsSummaryRow[];
  industryGroups: ParsedCseGicsIndustryGroupRow[];
  indexRows: ParsedCseGicsIndexRow[];
  classificationRows: ParsedCseGicsClassificationRow[];
  groupsAttempted: number;
  groupsSuccessful: number;
  groupsFailed: number;
  groupFailures: Array<{ industryGroupName: string; error: string }>;
  recordsBeforeDeduplication: number;
  recordsDeduplicated: number;
  duplicateSymbols: string[];
  validationReport: CseGicsValidationReport;
}

export interface CseGicsPromotionResult {
  industryGroupsCreated: number;
  industryGroupsUpdated: number;
  summariesCreated: number;
  summariesUpdated: number;
  indicesCreated: number;
  indicesUpdated: number;
  classificationsCreated: number;
  classificationsUpdated: number;
  classificationSnapshotsCreated: number;
  classificationSnapshotsUpdated: number;
  unmappedSymbols: string[];
  warnings: string[];
}

export interface CseDailyMarketSummaryValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  requiredFields: string[];
  parsedFieldCount: number;
  promotionAllowed: boolean;
}

export interface CseDailyMarketSummaryCalculatedMetrics {
  aspiChange: number | null;
  aspiChangePercent: number | null;
  spSl20Change: number | null;
  spSl20ChangePercent: number | null;
  foreignNetFlow: number | null;
  domesticNetFlow: number | null;
  turnoverChange: number | null;
  turnoverChangePercent: number | null;
  marketCapChange: number | null;
  marketCapChangePercent: number | null;
  tradedCompanyParticipationPercent: number | null;
}

export interface CseDailyMarketSummary {
  tradingDate: string;
  sourceUrl: string;
  sourceAsOfText?: string | null;
  fetchMode: CseFetchMode;
  fetchStrategy: string;
  checksum?: string | null;
  rawPayload: Record<string, unknown>;
  validationReport: CseDailyMarketSummaryValidationReport;
  warnings: string[];
  summary: Record<string, number | string | null | undefined>;
  calculated: CseDailyMarketSummaryCalculatedMetrics;
}

export interface FetchDailyMarketSummaryResult {
  sourceUrl: string;
  fetchMode: CseFetchMode;
  fetchStrategy: string;
  activeFetchStrategy?: string | null;
  tradingDate: string;
  sourceAsOfText?: string | null;
  checksum?: string | null;
  warnings: string[];
  validationReport: CseDailyMarketSummaryValidationReport;
  rawPayload: Record<string, unknown>;
  summary: Record<string, number | string | null | undefined>;
  rawStoragePath: string;
  rawArtifactPath: string;
  normalizedArtifactPath: string;
  validationArtifactPath: string;
}
