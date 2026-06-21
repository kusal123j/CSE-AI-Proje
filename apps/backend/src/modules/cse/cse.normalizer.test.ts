import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanLogoUrl, normalizeSignedPercent, parseNumber } from './cse.normalizer';

test('parseNumber handles CSE formatted numeric values', () => {
  assert.equal(parseNumber('1,201.25'), 1201.25);
  assert.equal(parseNumber('+10.75'), 10.75);
  assert.equal(parseNumber('-3.90'), -3.9);
  assert.equal(parseNumber(' '), null);
});

test('normalizeSignedPercent applies CSE red-loss sign from change amount', () => {
  assert.equal(normalizeSignedPercent(-3.9, 3.93), -3.93);
  assert.equal(normalizeSignedPercent(10.75, 0.9), 0.9);
  assert.equal(normalizeSignedPercent(0, 0), 0);
});

test('cleanLogoUrl removes HTML entity leftovers', () => {
  assert.equal(
    cleanLogoUrl('https://cdn.cse.lk/cmt/upload_logo/642_1603172106.jpeg&quot;'),
    'https://cdn.cse.lk/cmt/upload_logo/642_1603172106.jpeg'
  );
});
