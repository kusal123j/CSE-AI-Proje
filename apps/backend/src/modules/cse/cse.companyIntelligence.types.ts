export type CseCompanyImportType = 'COMPANY_PROFILE' | 'FINANCIAL_REPORTS' | 'ANNOUNCEMENTS' | 'LATEST_PRICES';

export interface CseCompanyPersonInput {
  personName: string;
  designation?: string | null;
  roleGroup?: string | null;
  rawRow?: Record<string, unknown>;
}

export interface CseCompanyProfileInput {
  symbol: string;
  companyName: string;
  isin?: string | null;
  logoUrl?: string | null;
  businessSummary?: string | null;
  gicsIndustryGroup?: string | null;
  foundedYear?: number | null;
  quotedDate?: string | null;
  financialYearEnd?: string | null;
  board?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  fax?: string | null;
  website?: string | null;
  companySecretaries?: string | null;
  auditors?: string | null;
  articlesOfAssociationUrl?: string | null;
  sourceUrl: string;
  rawPayloadHash?: string | null;
  rawPayload?: Record<string, unknown>;
  warnings?: string[];
  people?: CseCompanyPersonInput[];
}

export interface CseFinancialReportInput {
  symbol: string;
  reportType: 'ANNUAL_REPORT' | 'INTERIM_REPORT' | 'OTHER_REPORT' | string;
  title: string;
  financialYear?: string | null;
  period?: string | null;
  publishedDate?: string | null;
  pdfUrl?: string | null;
  sourceUrl?: string | null;
  sourceDocumentId?: string | null;
  payloadHash?: string | null;
  rawRow?: Record<string, unknown>;
}

export interface CseAnnouncementInput {
  symbol: string;
  announcementTitle: string;
  announcementCategory?: string | null;
  publishedAt?: string | null;
  publishedDate?: string | null;
  pdfUrl?: string | null;
  sourceUrl?: string | null;
  sourceAnnouncementId?: string | null;
  payloadHash?: string | null;
  rawRow?: Record<string, unknown>;
}

export interface CseLatestPriceInput {
  symbol: string;
  lastTradedPrice?: number | null;
  changeAmount?: number | null;
  changePercent?: number | null;
  previousClose?: number | null;
  openPrice?: number | null;
  highPrice?: number | null;
  lowPrice?: number | null;
  turnover?: number | null;
  shareVolume?: number | null;
  tradeVolume?: number | null;
  marketCap?: number | null;
  marketStatus?: string | null;
  tradeTime?: string | null;
  source?: string | null;
  rawPayloadHash?: string | null;
  rawPayload?: Record<string, unknown>;
}

export interface FetchCompanyProfileResult {
  sourceUrl: string;
  fetchMode: 'python-http';
  fetchStrategy: string;
  fetchedAt?: string | null;
  warnings: string[];
  profile: CseCompanyProfileInput;
  people: CseCompanyPersonInput[];
  rawPayload: Record<string, unknown>;
}

export interface FetchFinancialReportsResult {
  sourceUrl: string;
  fetchMode: 'python-http';
  fetchStrategy: string;
  fetchedAt?: string | null;
  warnings: string[];
  reports: CseFinancialReportInput[];
  rawPayload: Record<string, unknown>;
}

export interface FetchAnnouncementsResult {
  sourceUrl: string;
  fetchMode: 'python-http';
  fetchStrategy: string;
  fetchedAt?: string | null;
  warnings: string[];
  startDate: string;
  endDate: string;
  announcements: CseAnnouncementInput[];
  rawPayload: Record<string, unknown>;
}

export interface FetchLatestPricesResult {
  sourceUrl: string;
  fetchMode: 'python-http';
  fetchStrategy: string;
  fetchedAt?: string | null;
  marketStatus?: string | null;
  warnings: string[];
  prices: CseLatestPriceInput[];
  rawPayload: Record<string, unknown>;
}

export interface CseCompanyImportSummary {
  runId: string;
  status: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED';
  recordsFound: number;
  recordsFailed: number;
  documentsDiscovered?: number;
  announcementsDiscovered?: number;
  warnings: string[];
  rawFilePath?: string | null;
}

export interface CseMarketStatusInput {
  status?: string | null;
  isOpen?: boolean | null;
  source?: string | null;
  rawPayload?: Record<string, unknown>;
}

export interface CseImportSymbolResultsQuery {
  status?: string;
  importType?: CseCompanyImportType;
  symbol?: string;
  limit?: number;
  offset?: number;
}

export interface CseRetryFailedSymbolsInput {
  importType: CseCompanyImportType;
  startDate?: string;
  endDate?: string;
  limit?: number;
}
