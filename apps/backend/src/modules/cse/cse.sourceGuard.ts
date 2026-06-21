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
