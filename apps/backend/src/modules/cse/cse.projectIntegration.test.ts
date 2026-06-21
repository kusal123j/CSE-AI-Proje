import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readProjectFile(relativeFromBackendSrc: string): string {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', relativeFromBackendSrc), 'utf8');
}

test('CSE routes are registered in the real backend app.ts', () => {
  const appSource = readProjectFile('app.ts');
  assert.match(appSource, /import\s+\{\s*cseRoutes\s*\}\s+from\s+['"]\.\/modules\/cse\/cse\.routes['"]/);
  assert.match(appSource, /app\.use\(['"]\/api\/cse['"],\s*cseRoutes\)/);
});

test('CSE scheduler is wired into server startup but remains env-disabled by default', () => {
  const serverSource = readProjectFile('server.ts');
  const envSource = readProjectFile('config/env.ts');
  assert.match(serverSource, /startCseAlphabeticalScheduler/);
  assert.match(serverSource, /startCseTradeSummaryScheduler/);
  assert.match(envSource, /CSE_IMPORT_SCHEDULER_ENABLED:\s*booleanFromEnv\.default\(false\)/);
});

test('PostgreSQL schema includes CSE tables, uniqueness, ranking indexes, and import run metadata', () => {
  const schema = readProjectFile('database/schema.sql');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS cse_companies/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS cse_securities/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS cse_daily_market_snapshots/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS cse_fetch_runs/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS cse_import_artifacts/);
  assert.match(schema, /symbol VARCHAR\(30\) NOT NULL UNIQUE/);
  assert.match(schema, /CONSTRAINT cse_daily_market_symbol_date_unique UNIQUE \(symbol, trading_date\)/);
  assert.match(schema, /idx_cse_daily_market_change_percent/);
  assert.match(schema, /idx_cse_daily_market_turnover/);
  assert.match(schema, /idx_cse_daily_market_trade_volume/);
  assert.match(schema, /idx_cse_daily_market_share_volume/);
  assert.match(schema, /previous_close NUMERIC/);
  assert.match(schema, /is_watch_list BOOLEAN/);
  assert.match(schema, /source_market_timestamp_text TEXT/);
  assert.match(schema, /letters_attempted INTEGER/);
  assert.match(schema, /records_deduplicated INTEGER/);
  assert.match(schema, /validation_report JSONB/);
  assert.match(schema, /trigger_type TEXT/);
});

test('repository uses idempotent ON CONFLICT upserts for company, security, and snapshot', () => {
  const repository = readProjectFile('modules/cse/cse.repository.ts');
  assert.match(repository, /ON CONFLICT \(normalized_name\)/);
  assert.match(repository, /ON CONFLICT \(normalized_symbol\)/);
  assert.match(repository, /ON CONFLICT \(symbol, trading_date\)/);
});

test('backend env is locked to Python HTTP alphabetical import mode', () => {
  const envSource = readProjectFile('config/env.ts');
  assert.match(envSource, /CSE_IMPORT_FETCH_MODE:\s*z\.literal\(['\"]python-http['\"]\)/);
  assert.match(envSource, /CSE_TRADE_SUMMARY_SOURCE_URL/);
  const serviceSource = readProjectFile('modules/cse/cse.service.ts');
  assert.match(serviceSource, /csvDiscoveryEnabled:\s*true/);
  assert.match(serviceSource, /htmlFallbackEnabled:\s*true/);
  assert.doesNotMatch(envSource, /CSE_IMPORT_CSV_URL|CSE_IMPORT_AZ_EXPORT_URL_TEMPLATE/);
  assert.doesNotMatch(envSource, /CSE_IMPORT_BROWSER_HEADLESS|CSE_IMPORT_BROWSER_TIMEOUT_MS|CSE_IMPORT_DOWNLOAD_TIMEOUT_MS/);
});

test('backend Docker image does not include Playwright browser runtime dependencies', () => {
  const dockerfile = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'Dockerfile'), 'utf8');
  assert.doesNotMatch(dockerfile, /playwright|chromium/i);
  assert.match(dockerfile, /FROM\s+node:/);
  assert.match(dockerfile, /RUN\s+npm\s+(?:ci|install)/);
});

test('backend package no longer depends on Playwright for CSE import', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'package.json'), 'utf8'));
  const packageLock = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'package-lock.json'), 'utf8'));

  assert.equal(packageJson.dependencies.playwright, undefined);
  assert.equal(packageLock.packages[''].dependencies.playwright, undefined);
  assert.equal(packageLock.packages['node_modules/playwright'], undefined);
  assert.equal(packageLock.packages['node_modules/playwright-core'], undefined);
});
