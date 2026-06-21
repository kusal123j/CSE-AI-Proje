import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { CseImportValidationReport, CseLetterValidationDetail, FetchAlphabeticalResult, ParsedCseAlphabeticalRow } from './cse.types';

const EXPECTED_LETTERS = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));

function uniqueCount(values: string[]): number {
  return new Set(values.filter(Boolean)).size;
}

export function findDuplicateSymbols(rows: ParsedCseAlphabeticalRow[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const row of rows) {
    const symbol = (row.normalizedSymbol || row.symbol || '').trim().toUpperCase();
    if (!symbol) continue;
    if (seen.has(symbol)) duplicates.add(symbol);
    seen.add(symbol);
  }
  return [...duplicates].sort();
}

function letterDetails(fetched: FetchAlphabeticalResult): CseLetterValidationDetail[] {
  const fromFetcher = new Map((fetched.letterResults ?? []).map((item) => [item.letter, item]));
  const fromArtifacts = new Map((fetched.rawArtifacts ?? []).map((item) => [item.letter, item]));
  return EXPECTED_LETTERS.map((letter) => {
    const detail = fromFetcher.get(letter);
    const artifact = fromArtifacts.get(letter);
    const rowCount = Number(detail?.rowCount ?? artifact?.rowCount ?? 0);
    const status = detail?.status ?? artifact?.status ?? (artifact ? (rowCount > 0 ? 'success' : 'empty') : 'unknown');
    return {
      letter,
      status,
      rowCount,
      attempts: detail?.attempts ?? artifact?.attempts ?? null,
      error: detail?.error ?? artifact?.lastError ?? null
    };
  });
}

export function validateFetchedAlphabeticalResult(fetched: FetchAlphabeticalResult): CseImportValidationReport {
  const warnings = [...fetched.warnings];
  const errors: string[] = [];
  const duplicateSymbols = [...new Set([...(fetched.duplicateSymbols ?? []), ...findDuplicateSymbols(fetched.rows)])].sort();
  const uniqueCompanyCount = uniqueCount(fetched.rows.map((row) => row.normalizedCompanyName || row.companyName));
  const uniqueSymbolCount = uniqueCount(fetched.rows.map((row) => row.normalizedSymbol || row.symbol));
  const rawRowCount = fetched.recordsBeforeDeduplication || fetched.rows.length;
  const details = letterDetails(fetched);
  const failedLetters = fetched.failedLetters.length
    ? fetched.failedLetters
    : details.filter((item) => item.status === 'failed').map((item) => ({ letter: item.letter, error: item.error ?? 'Unknown letter fetch error', attempts: item.attempts ?? undefined }));
  const emptyLetters = details.filter((item) => item.status === 'empty' || (item.status === 'success' && item.rowCount === 0)).map((item) => item.letter);

  if (fetched.lettersAttempted !== EXPECTED_LETTERS.length) {
    errors.push(`Expected all 26 A-Z letters to be attempted, but importer attempted ${fetched.lettersAttempted}.`);
  }

  const completedLetters = details.filter((item) => item.status === 'success' || item.status === 'empty').length;
  const terminalLetters = completedLetters + failedLetters.length;
  if (terminalLetters !== fetched.lettersAttempted) {
    errors.push(`Letter counters are inconsistent: completed(success or valid-empty) + failed (${terminalLetters}) does not equal attempted (${fetched.lettersAttempted}).`);
  }

  if (fetched.lettersFailed > 0 || failedLetters.length > 0) {
    errors.push(`CSE A-Z import had failed letters: ${failedLetters.map((item) => `${item.letter} (${item.error}${item.attempts ? ` after ${item.attempts} attempts` : ''})`).join(', ') || fetched.lettersFailed}.`);
  }

  const artifactLetters = new Set((fetched.rawArtifacts ?? []).map((artifact) => artifact.letter));
  for (const letter of EXPECTED_LETTERS) {
    if (!artifactLetters.has(letter)) errors.push(`Missing raw artifact for letter ${letter}.`);
  }

  if (fetched.rows.length === 0) {
    errors.push('CSE A-Z import returned an empty merged dataset.');
  }

  if (uniqueCompanyCount < env.CSE_IMPORT_MIN_COMPANIES) {
    errors.push(`Unique company count ${uniqueCompanyCount} is below configured minimum ${env.CSE_IMPORT_MIN_COMPANIES}.`);
  }

  if (uniqueSymbolCount < env.CSE_IMPORT_MIN_SECURITIES) {
    errors.push(`Unique security/symbol count ${uniqueSymbolCount} is below configured minimum ${env.CSE_IMPORT_MIN_SECURITIES}.`);
  }

  if (rawRowCount < env.CSE_IMPORT_MIN_EXPECTED_ROWS) {
    errors.push(`Raw row count ${rawRowCount} is below configured minimum ${env.CSE_IMPORT_MIN_EXPECTED_ROWS}.`);
  }

  if (duplicateSymbols.length > 0) {
    errors.push(`Duplicate symbols detected before promotion: ${duplicateSymbols.join(', ')}.`);
  }

  for (const row of fetched.rows) {
    if (!row.companyName?.trim()) errors.push(`Row with symbol ${row.symbol || '(missing symbol)'} has no company name.`);
    if (!row.symbol?.trim()) errors.push(`Row for company ${row.companyName || '(missing company)'} has no symbol.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    uniqueCompanyCount,
    uniqueSymbolCount,
    rawRowCount,
    duplicateSymbols,
    lettersAttempted: fetched.lettersAttempted,
    lettersSuccessful: fetched.lettersSuccessful,
    lettersFailed: fetched.lettersFailed,
    failedLetters,
    emptyLetters,
    letterResults: details,
    thresholds: {
      minCompanies: env.CSE_IMPORT_MIN_COMPANIES,
      minSecurities: env.CSE_IMPORT_MIN_SECURITIES,
      minExpectedRows: env.CSE_IMPORT_MIN_EXPECTED_ROWS
    },
    promotionAllowed: errors.length === 0
  };
}

export function assertValidFetchedAlphabeticalResult(fetched: FetchAlphabeticalResult): CseImportValidationReport {
  const report = validateFetchedAlphabeticalResult(fetched);
  if (!report.valid) {
    throw new AppError(502, `CSE import validation failed: ${report.errors.join(' | ')}`);
  }
  return report;
}
