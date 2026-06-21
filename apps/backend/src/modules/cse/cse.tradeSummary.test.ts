import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function read(relativeFromBackendSrc: string): string {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', relativeFromBackendSrc), 'utf8');
}

test('Trade Summary backend route is registered separately from A-Z import', () => {
  const routes = read('modules/cse/cse.routes.ts');
  assert.match(routes, /\/import\/alphabetical\/run/);
  assert.match(routes, /\/import\/trade-summary\/run/);
  assert.match(routes, /runTradeSummaryImport/);
});

test('Trade Summary schema fields are present on daily market snapshots', () => {
  const schema = read('database/schema.sql');
  for (const column of ['previous_close', 'open_price', 'high_price', 'low_price', 'is_watch_list', 'market_timestamp', 'source_market_timestamp_text']) {
    assert.match(schema, new RegExp(column));
  }
  assert.match(schema, /idx_cse_daily_market_watch_list/);
  assert.match(schema, /idx_cse_daily_market_source_page/);
});

test('Trade Summary importer uses Python HTTP path and no browser automation dependency', () => {
  const fetcher = read('modules/cse/cse.fetcher.ts');
  const service = read('modules/cse/cse.service.ts');
  assert.match(fetcher, /\/cse\/import\/trade-summary/);
  assert.match(service, /CSE_TRADE_SUMMARY/);
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'package.json'), 'utf8'));
  assert.equal(packageJson.dependencies.playwright, undefined);
  assert.equal(packageJson.dependencies.puppeteer, undefined);
  assert.equal(packageJson.dependencies.selenium, undefined);
});

test('Trade Summary analytics include Watch List movers and market breadth', () => {
  const analytics = read('modules/cse/cse.analytics.service.ts');
  assert.match(analytics, /watchListMovers/);
  assert.match(analytics, /marketBreadth/);
  assert.match(analytics, /source_page = 'TRADE_SUMMARY'/);
});

import { summarizeTradeSummaryCompletion } from './cse.service';

test('Trade Summary completion helper marks clean imports as success', () => {
  const result = summarizeTradeSummaryCompletion({ rowCount: 289, minExpectedRows: 100 });
  assert.equal(result.status, 'SUCCESS');
  assert.deepEqual(result.warnings, []);
});

test('Trade Summary completion helper marks fallback/warning imports as partial success', () => {
  const result = summarizeTradeSummaryCompletion({
    rowCount: 289,
    minExpectedRows: 100,
    fetchedWarnings: ['Trade Summary API fetch failed; trying configured CSV fallback. timeout'],
    promotionWarnings: ['Unknown Trade Summary symbol XYZ.N0000; created placeholder company/security from Trade Summary row.']
  });
  assert.equal(result.status, 'PARTIAL_SUCCESS');
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[1], /Unknown Trade Summary symbol/);
});

test('Trade Summary completion helper adds low-row-count warning', () => {
  const result = summarizeTradeSummaryCompletion({ rowCount: 25, minExpectedRows: 100 });
  assert.equal(result.status, 'PARTIAL_SUCCESS');
  assert.deepEqual(result.warnings, ['Trade Summary row count 25 is below configured minimum 100.']);
});
