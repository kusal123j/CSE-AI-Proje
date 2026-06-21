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
}

export interface FetchAlphabeticalResult {
  rows: ParsedCseAlphabeticalRow[];
  rawContent: string;
  fetchMode: CseFetchMode;
  sourceUrl: string;
  warnings: string[];
  rawStoragePath: string;
  downloadedFiles: CseDownloadedLetterFile[];
  lettersAttempted: number;
  lettersSuccessful: number;
  lettersFailed: number;
  failedLetters: CseLetterFailure[];
  recordsBeforeDeduplication: number;
  recordsDeduplicated: number;
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
}

export interface CseListQuery {
  page?: number;
  limit?: number;
  search?: string;
  date?: string;
}
