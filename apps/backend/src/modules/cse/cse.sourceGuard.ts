import { AppError } from '../../middleware/errorHandler';

const FORBIDDEN_PAGE_VALUES = new Set([
  'DATE_LISTED',
  'DATE LISTED',
  'TYPE_OF_ISSUE',
  'TYPE OF ISSUE',
  'TURNOVER',
  'TRADE_VOLUME',
  'TRADE VOLUME',
  'SHARE_VOLUME',
  'SHARE VOLUME',
  'GAINERS',
  'LOSERS'
]);

export function assertAlphabeticalSourceUrl(sourceUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new AppError(400, 'Invalid CSE source URL');
  }

  if (parsed.hostname !== 'www.cse.lk' && parsed.hostname !== 'cse.lk') {
    throw new AppError(400, 'Only cse.lk source URLs are allowed for this importer');
  }

  if (!parsed.pathname.includes('/listed-entities/listed-company-directory')) {
    throw new AppError(400, 'Only CSE listed-company-directory source path is allowed');
  }

  const page = parsed.searchParams.get('page')?.trim().toUpperCase() ?? '';
  if (page !== 'ALPHABETICAL') {
    throw new AppError(400, 'Only page=ALPHABETICAL is allowed for this importer');
  }

  for (const value of parsed.searchParams.values()) {
    if (FORBIDDEN_PAGE_VALUES.has(value.trim().toUpperCase())) {
      throw new AppError(400, `Forbidden CSE tab/source is not allowed: ${value}`);
    }
  }
}

function assertCsePath(sourceUrl: string, expectedPath: string, label: string): void {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new AppError(400, `Invalid ${label} source URL`);
  }
  if (parsed.hostname !== 'www.cse.lk' && parsed.hostname !== 'cse.lk') {
    throw new AppError(400, `Only cse.lk source URLs are allowed for ${label}`);
  }
  if (!parsed.pathname.includes(expectedPath)) {
    throw new AppError(400, `Only the CSE ${expectedPath} source path is allowed for ${label}`);
  }
}

export function assertGicsSummarySourceUrl(sourceUrl: string): void {
  assertCsePath(sourceUrl, '/equity/gics-industry-group-summary', 'GICS Summary importer');
}

export function assertGicsIndicesSourceUrl(sourceUrl: string): void {
  assertCsePath(sourceUrl, '/equity/gics-industry-group-indices', 'GICS Indices importer');
}

export function assertGicsClassificationSourceUrl(sourceUrl: string): void {
  assertCsePath(sourceUrl, '/listed-entities/gics-classification', 'GICS Classification importer');
}
export function assertDailyMarketSummarySourceUrl(sourceUrl: string): void {
  assertCsePath(sourceUrl, '/equity/daily-market-summary', 'Daily Market Summary importer');
}

function assertCseApiPath(sourceUrl: string, expectedPath: string, label: string): void {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new AppError(400, `Invalid ${label} URL`);
  }
  if (!['www.cse.lk', 'cse.lk', 'cdn.cse.lk'].includes(parsed.hostname)) {
    throw new AppError(400, `Only cse.lk/cdn.cse.lk URLs are allowed for ${label}`);
  }
  if (!parsed.pathname.includes(expectedPath)) {
    throw new AppError(400, `Only the CSE ${expectedPath} path is allowed for ${label}`);
  }
}

export function assertCseCompanyProfileUrl(sourceUrl: string): void {
  assertCseApiPath(sourceUrl, '/company-profile', 'Company Profile importer');
}

export function assertCseCompanyProfileApiUrl(sourceUrl: string): void {
  assertCseApiPath(sourceUrl, '/api/companyInfoSummery', 'Company Profile API importer');
}

export function assertCseFinancialReportsApiUrl(sourceUrl: string): void {
  assertCseApiPath(sourceUrl, '/api/getFinancialAnnouncement', 'Company Financial Reports importer');
}

export function assertCseAnnouncementApiUrl(sourceUrl: string): void {
  assertCseApiPath(sourceUrl, '/api/approvedAnnouncement', 'Company Announcements importer');
}

export function assertCseLatestPriceApiUrl(sourceUrl: string): void {
  assertCseApiPath(sourceUrl, '/api/todaySharePrice', 'Latest Price importer');
}

export function assertCseMarketStatusApiUrl(sourceUrl: string): void {
  assertCseApiPath(sourceUrl, '/api/marketStatus', 'Market Status importer');
}

const CSE_ALLOWED_PDF_HOSTS = new Set(['www.cse.lk', 'cse.lk', 'cdn.cse.lk']);

function parseCsePdfUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed || /^(javascript|data):/i.test(trimmed)) return null;
  try {
    return new URL(trimmed);
  } catch {
    try {
      return new URL(trimmed.startsWith('/') ? trimmed : `/${trimmed}`, 'https://www.cse.lk');
    } catch {
      return null;
    }
  }
}

export function normalizeCsePdfUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const parsed = parseCsePdfUrl(input);
  if (!parsed) return null;

  const host = parsed.hostname.toLowerCase();
  if (!CSE_ALLOWED_PDF_HOSTS.has(host)) return null;

  let pathname = parsed.pathname.replace(/\\/g, '/');
  pathname = pathname.replace(/^\/api\/cmt\//i, '/cmt/');
  if (!pathname.startsWith('/')) pathname = `/${pathname}`;

  if (!pathname.toLowerCase().endsWith('.pdf')) return null;
  if (!pathname.toLowerCase().includes('/cmt/upload_report_file/')) return null;

  const encodedPath = pathname
    .split('/')
    .map((part) => {
      try {
        return encodeURIComponent(decodeURIComponent(part));
      } catch {
        return encodeURIComponent(part);
      }
    })
    .join('/');
  return `https://cdn.cse.lk${encodedPath}`;
}

export function isAllowedCsePdfUrl(input: string | null | undefined): boolean {
  return Boolean(normalizeCsePdfUrl(input));
}

export function assertAllowedCsePdfUrl(input: string): string {
  const normalized = normalizeCsePdfUrl(input);
  if (!normalized) {
    throw new AppError(400, 'Only CSE CDN upload_report_file PDF URLs are allowed');
  }
  return normalized;
}

export function assertCsePdfUrl(sourceUrl: string): void {
  assertAllowedCsePdfUrl(sourceUrl);
}
