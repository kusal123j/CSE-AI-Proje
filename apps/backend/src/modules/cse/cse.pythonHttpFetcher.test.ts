import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('CSE fetcher delegates alphabetical import to the Python HTTP worker without browser automation', () => {
  const source = fs.readFileSync(path.resolve(__dirname, 'cse.fetcher.ts'), 'utf8');

  assert.match(source, /PYTHON_WORKER_URL/);
  assert.match(source, /\/cse\/import\/alphabetical/);
  assert.doesNotMatch(source, /playwright|chromium|puppeteer|selenium|getByRole|waitForEvent|downloadAlphabeticalLettersWithBrowser/i);
  assert.doesNotMatch(source, /CSE_IMPORT_CSV_URL|AZ_EXPORT_URL/i);
});
