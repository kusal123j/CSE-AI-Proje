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
  assert.match(source, /fallbackEnabled:\s*false/);
  assert.doesNotMatch(source, /browserAutomationOnly:\s*true/);
});
