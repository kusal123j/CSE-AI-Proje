import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
process.env.CSE_IMPORT_MIN_EXPECTED_ROWS = '2';
process.env.CSE_IMPORT_MIN_COMPANIES = '2';
process.env.CSE_IMPORT_MIN_SECURITIES = '2';

async function loadValidator() {
  return import('./cse.validator');
}

function row(companyName: string, symbol: string, sourceLetter = 'A') {
  return {
    companyName,
    normalizedCompanyName: companyName.toUpperCase(),
    symbol,
    normalizedSymbol: symbol.toUpperCase(),
    profileUrl: null,
    logoUrl: null,
    lastTradedPrice: null,
    tradeVolume: null,
    shareVolume: null,
    turnover: null,
    changeAmount: null,
    changePercent: null,
    sourceLetter,
    rawRow: { sourceLetter }
  };
}

function baseFetched(overrides = {}) {
  const letters = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
  return {
    rows: [row('Alpha PLC', 'ALPH.N0000'), row('Beta PLC', 'BETA.N0000', 'B')],
    rawContent: '{}',
    fetchMode: 'python-http' as const,
    sourceUrl: 'https://www.cse.lk/listed-entities/listed-company-directory?page=ALPHABETICAL',
    warnings: [],
    rawStoragePath: '/tmp/cse-test',
    downloadedFiles: [],
    rawArtifacts: letters.map((letter) => ({ letter, filePath: `/tmp/${letter}.json`, suggestedFilename: `${letter}.json`, rowCount: letter === 'A' || letter === 'B' ? 1 : 0 })),
    lettersAttempted: 26,
    lettersSuccessful: 26,
    lettersFailed: 0,
    failedLetters: [],
    recordsBeforeDeduplication: 2,
    recordsDeduplicated: 0,
    ...overrides
  };
}

test('validation accepts full A-Z letter-by-letter import with enough companies and symbols', async () => {
  const { validateFetchedAlphabeticalResult } = await loadValidator();
  const report = validateFetchedAlphabeticalResult(baseFetched());
  assert.equal(report.valid, true);
  assert.equal(report.uniqueCompanyCount, 2);
  assert.equal(report.uniqueSymbolCount, 2);
});



test('validation treats valid empty letters as completed A-Z letters', async () => {
  const { validateFetchedAlphabeticalResult } = await loadValidator();
  const letters = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
  const report = validateFetchedAlphabeticalResult(
    baseFetched({
      rawArtifacts: letters.map((letter) => ({
        letter,
        filePath: `/tmp/${letter}.json`,
        suggestedFilename: `${letter}.json`,
        rowCount: letter === 'A' || letter === 'B' ? 1 : 0,
        status: letter === 'A' || letter === 'B' ? 'success' : 'empty'
      })),
      letterResults: letters.map((letter) => ({
        letter,
        status: letter === 'A' || letter === 'B' ? 'success' : 'empty',
        rowCount: letter === 'A' || letter === 'B' ? 1 : 0,
        attempts: 1,
        error: null
      })),
      lettersSuccessful: 26,
      lettersFailed: 0
    })
  );
  assert.equal(report.valid, true);
  assert.deepEqual(report.emptyLetters, letters.filter((letter) => letter !== 'A' && letter !== 'B'));
});

test('validation blocks partial A-Z imports before live promotion', async () => {
  const { validateFetchedAlphabeticalResult } = await loadValidator();
  const report = validateFetchedAlphabeticalResult(
    baseFetched({
      lettersSuccessful: 25,
      lettersFailed: 1,
      failedLetters: [{ letter: 'Z', error: 'timeout' }]
    })
  );
  assert.equal(report.valid, false);
  assert.match(report.errors.join(' '), /failed letters/);
});

test('validation blocks duplicate symbols before live promotion', async () => {
  const { validateFetchedAlphabeticalResult } = await loadValidator();
  const report = validateFetchedAlphabeticalResult(
    baseFetched({
      rows: [row('Alpha PLC', 'ALPH.N0000'), row('Alpha PLC duplicate', 'ALPH.N0000')],
      duplicateSymbols: ['ALPH.N0000'],
      recordsBeforeDeduplication: 2
    })
  );
  assert.equal(report.valid, false);
  assert.match(report.errors.join(' '), /Duplicate symbols/);
});
