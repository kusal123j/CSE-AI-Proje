import assert from 'node:assert/strict';
import test from 'node:test';
import { assertAlphabeticalSourceUrl } from './cse.sourceGuard';

test('source guard allows only CSE ALPHABETICAL directory', () => {
  assert.doesNotThrow(() => assertAlphabeticalSourceUrl('https://www.cse.lk/listed-entities/listed-company-directory?page=ALPHABETICAL'));
});

test('source guard blocks forbidden CSE tabs', () => {
  assert.throws(() => assertAlphabeticalSourceUrl('https://www.cse.lk/listed-entities/listed-company-directory?page=GAINERS'));
  assert.throws(() => assertAlphabeticalSourceUrl('https://www.cse.lk/listed-entities/listed-company-directory?page=LOSERS'));
  assert.throws(() => assertAlphabeticalSourceUrl('https://www.cse.lk/listed-entities/listed-company-directory?page=TURNOVER'));
});
