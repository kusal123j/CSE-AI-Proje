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
  source: 'CSE Listed Company Directory - ALPHABETICAL';
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
