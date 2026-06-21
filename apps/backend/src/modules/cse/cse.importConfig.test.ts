import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('import config reports Python HTTP mode and disables browser automation/fallbacks', () => {
  const source = fs.readFileSync(path.resolve(__dirname, 'cse.service.ts'), 'utf8');

  assert.match(source, /mode:\s*env\.CSE_IMPORT_FETCH_MODE/);
  assert.match(source, /source:\s*['"]CSE_LISTED_COMPANY_DIRECTORY_ALPHABETICAL['"]/);
  assert.match(source, /browserAutomationEnabled:\s*false/);
  assert.match(source, /playwrightEnabled:\s*false/);
  assert.match(source, /directApiExportAllowed:\s*true/);
  assert.match(source, /fetchGranularity:\s*['"]A_Z_LETTER_BY_LETTER['"]/);
  assert.match(source, /fullExportSupported:\s*false/);
  assert.match(source, /fallbackEnabled:\s*false/);
  assert.doesNotMatch(source, /browserAutomationOnly:\s*true/);
});

test('import config includes separate GICS importer without browser automation', () => {
  const source = fs.readFileSync(path.resolve(__dirname, 'cse.service.ts'), 'utf8');

  assert.match(source, /gics:\s*{/);
  assert.match(source, /source:\s*['"]CSE_GICS['"]/);
  assert.match(source, /summaryUrl:\s*env\.CSE_GICS_SUMMARY_SOURCE_URL/);
  assert.match(source, /indicesUrl:\s*env\.CSE_GICS_INDICES_SOURCE_URL/);
  assert.match(source, /classificationUrl:\s*env\.CSE_GICS_CLASSIFICATION_SOURCE_URL/);
  assert.match(source, /csvDownloadPreferred:\s*true/);
  assert.match(source, /htmlFallbackEnabled:\s*true/);
  assert.match(source, /browserAutomationEnabled:\s*false/);
  assert.match(source, /playwrightEnabled:\s*false/);
});
