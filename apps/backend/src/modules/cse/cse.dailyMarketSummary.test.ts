import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function read(relativeFromBackendSrc: string): string {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', relativeFromBackendSrc), 'utf8');
}

test('Daily Market Summary schema is separate from company-level market snapshots', () => {
  const schema = read('database/schema.sql');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS cse_daily_market_summaries/);
  assert.match(schema, /CONSTRAINT cse_daily_market_summaries_trading_date_unique UNIQUE \(trading_date\)/);
  assert.match(schema, /aspi_today NUMERIC/);
  assert.match(schema, /aspi_previous NUMERIC/);
  assert.match(schema, /sp_sl20_today NUMERIC/);
  assert.match(schema, /sp_sl20_previous NUMERIC/);
  assert.match(schema, /equity_turnover_today NUMERIC/);
  assert.match(schema, /equity_turnover_previous NUMERIC/);
  assert.match(schema, /market_cap_today NUMERIC/);
  assert.match(schema, /market_cap_previous NUMERIC/);
  assert.match(schema, /cds_total_quantity BIGINT/);
});

test('Daily Market Summary backend endpoints and Python worker route are wired', () => {
  const routes = read('modules/cse/cse.routes.ts');
  const controller = read('modules/cse/cse.controller.ts');
  const fetcher = read('modules/cse/cse.fetcher.ts');
  assert.match(routes, /\/import\/daily-market-summary\/run/);
  assert.match(routes, /\/daily-market-summary\/latest/);
  assert.match(routes, /\/daily-market-summary\/history/);
  assert.match(controller, /runDailyMarketSummaryImport/);
  assert.match(fetcher, /\/cse\/import\/daily-market-summary/);
});

test('Daily Market Summary backend revalidates key fields before DB save', () => {
  const service = read('modules/cse/cse.service.ts');
  assert.match(service, /validateDailyMarketSummaryBeforeSave/);
  assert.match(service, /aspiPrevious/);
  assert.match(service, /spSl20Previous/);
  assert.match(service, /equityTurnoverPrevious/);
  assert.match(service, /marketCapPrevious/);
  assert.match(service, /Required Daily Market Summary field missing before DB save/);
  assert.match(service, /status: 'FAILED'/);
  assert.match(service, /recordsFailed: 1/);
});

test('Daily Market Summary repository uses same-date upsert and analytics calculates market context', () => {
  const repository = read('modules/cse/cse.repository.ts');
  const analytics = read('modules/cse/cse.analytics.service.ts');
  assert.match(repository, /ON CONFLICT \(trading_date\) DO UPDATE/);
  assert.match(analytics, /aspiChangePercent/);
  assert.match(analytics, /spSl20ChangePercent/);
  assert.match(analytics, /foreignNetFlow/);
  assert.match(analytics, /tradedCompanyParticipationPercent/);
});

test('Daily Market Summary uses HTTP/API plus HTML fallback and no browser automation', () => {
  const envSource = read('config/env.ts');
  const service = read('modules/cse/cse.service.ts');
  const scheduler = read('modules/cse/cse.scheduler.ts');
  assert.match(envSource, /CSE_DAILY_MARKET_SUMMARY_SOURCE_URL/);
  assert.match(service, /api-first-html-fallback/);
  assert.match(service, /browserAutomationEnabled:\s*false/);
  assert.match(service, /playwrightEnabled:\s*false/);
  assert.match(scheduler, /startCseDailyMarketSummaryScheduler/);

  const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'package.json'), 'utf8'));
  assert.equal(packageJson.dependencies.playwright, undefined);
  assert.equal(packageJson.dependencies.puppeteer, undefined);
  assert.equal(packageJson.dependencies.selenium, undefined);
});

test('Mega Panel keeps A-Z run filtering separate from Daily Market Summary runs', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', 'mega-panel', 'app', 'cse-import', 'page.tsx'), 'utf8');
  assert.match(page, /run\.source === 'CSE_ALPHABETICAL'/);
  assert.doesNotMatch(page, /run\.source !== 'CSE_TRADE_SUMMARY'/);
});
