import assert from 'node:assert/strict';
import test from 'node:test';
import { assertAlphabeticalSourceUrl, assertGicsClassificationSourceUrl, assertGicsIndicesSourceUrl, assertGicsSummarySourceUrl } from './cse.sourceGuard';

test('source guard allows only CSE ALPHABETICAL directory', () => {
  assert.doesNotThrow(() => assertAlphabeticalSourceUrl('https://www.cse.lk/listed-entities/listed-company-directory?page=ALPHABETICAL'));
});

test('source guard blocks forbidden CSE tabs', () => {
  assert.throws(() => assertAlphabeticalSourceUrl('https://www.cse.lk/listed-entities/listed-company-directory?page=GAINERS'));
  assert.throws(() => assertAlphabeticalSourceUrl('https://www.cse.lk/listed-entities/listed-company-directory?page=LOSERS'));
  assert.throws(() => assertAlphabeticalSourceUrl('https://www.cse.lk/listed-entities/listed-company-directory?page=TURNOVER'));
});

test('GICS source guards allow only official CSE GICS pages', () => {
  assert.doesNotThrow(() => assertGicsSummarySourceUrl('https://www.cse.lk/equity/gics-industry-group-summary'));
  assert.doesNotThrow(() => assertGicsIndicesSourceUrl('https://www.cse.lk/equity/gics-industry-group-indices'));
  assert.doesNotThrow(() => assertGicsClassificationSourceUrl('https://www.cse.lk/listed-entities/gics-classification'));
});

test('GICS source guards reject wrong hosts and wrong CSE paths', () => {
  assert.throws(() => assertGicsSummarySourceUrl('https://example.com/equity/gics-industry-group-summary'));
  assert.throws(() => assertGicsIndicesSourceUrl('https://www.cse.lk/equity/trade-summary'));
  assert.throws(() => assertGicsClassificationSourceUrl('https://www.cse.lk/listed-entities/listed-company-directory?page=ALPHABETICAL'));
});
