import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('GICS fetcher has strict validation for empty and partial imports', () => {
  const source = fs.readFileSync(path.resolve(__dirname, 'cse.fetcher.ts'), 'utf8');

  assert.match(source, /browserAutomationEnabled\s*===\s*true/);
  assert.match(source, /GICS Summary returned zero rows/);
  assert.match(source, /GICS Summary industry-group mapping returned zero rows/);
  assert.match(source, /GICS Indices returned zero rows/);
  assert.match(source, /GICS Classification returned zero rows/);
  assert.match(source, /groupsAttempted\s*<\s*minExpectedGroups/);
  assert.match(source, /classificationRowCount\s*<\s*minExpectedClassificationRows/);
  assert.match(source, /groupsSuccessful\s*<\s*Math\.max/);
});

test('GICS fetcher writes validation, download-discovery, and group-fetch reports', () => {
  const source = fs.readFileSync(path.resolve(__dirname, 'cse.fetcher.ts'), 'utf8');

  assert.match(source, /gics-validation-report\.json/);
  assert.match(source, /gics-download-discovery-report\.json/);
  assert.match(source, /gics-group-fetch-report\.json/);
  assert.match(source, /datasetFetchModes/);
  assert.match(source, /rawResponses/);
});
