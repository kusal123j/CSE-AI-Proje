import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('CSE company-intelligence exposes per-symbol run results and retry-failed endpoints', () => {
  const routes = fs.readFileSync(path.resolve(__dirname, 'cse.routes.ts'), 'utf8');
  const controller = fs.readFileSync(path.resolve(__dirname, 'cse.controller.ts'), 'utf8');
  const service = fs.readFileSync(path.resolve(__dirname, 'cse.companyIntelligence.service.ts'), 'utf8');
  const repository = fs.readFileSync(path.resolve(__dirname, 'cse.companyIntelligence.repository.ts'), 'utf8');

  assert.match(routes, /\/import\/runs\/:id\/symbol-results/);
  assert.match(routes, /\/import\/runs\/:id\/retry-failed/);
  assert.match(controller, /importRunSymbolResults/);
  assert.match(controller, /retryFailedImportSymbols/);
  assert.match(service, /retryFailedSymbols/);
  assert.match(repository, /listImportRunSymbolResults/);
  assert.match(repository, /listFailedSymbolsForRun/);
});

test('CSE company-intelligence has document retry controls for reports and announcements', () => {
  const routes = fs.readFileSync(path.resolve(__dirname, 'cse.routes.ts'), 'utf8');
  const service = fs.readFileSync(path.resolve(__dirname, 'cse.companyIntelligence.service.ts'), 'utf8');
  const repository = fs.readFileSync(path.resolve(__dirname, 'cse.companyIntelligence.repository.ts'), 'utf8');

  assert.match(routes, /company-financial-reports\/:id\/retry-document/);
  assert.match(routes, /company-announcements\/:id\/retry-document/);
  assert.match(service, /retryFinancialReportDocument/);
  assert.match(service, /retryAnnouncementDocument/);
  assert.match(repository, /assertCsePdfUrl\(report\.pdf_url\)/);
  assert.match(repository, /assertCsePdfUrl\(announcement\.pdf_url\)/);
});

test('CSE latest price flow is market-status-first for scheduled polling', () => {
  const fetcher = fs.readFileSync(path.resolve(__dirname, 'cse.companyIntelligence.fetcher.ts'), 'utf8');
  const service = fs.readFileSync(path.resolve(__dirname, 'cse.companyIntelligence.service.ts'), 'utf8');
  const python = fs.readFileSync(path.resolve(__dirname, '../../../../python-worker/app/cse_latest_price_importer.py'), 'utf8');

  assert.match(fetcher, /skipWhenMarketClosed/);
  assert.match(service, /triggerType === 'scheduled'/);
  assert.match(service, /insertMarketStatusSnapshot/);
  assert.match(python, /skip_when_market_closed/);
  assert.match(python, /Market status indicates closed/);
});

test('CSE live API verification script exists and avoids browser automation', () => {
  const verifier = fs.readFileSync(path.resolve(__dirname, '../../../../python-worker/scripts/verify_cse_live_endpoints.py'), 'utf8');
  assert.match(verifier, /companyInfoSummery/);
  assert.match(verifier, /getFinancialAnnouncement/);
  assert.match(verifier, /approvedAnnouncement/);
  assert.match(verifier, /todaySharePrice/);
  assert.match(verifier, /marketStatus/);
  assert.doesNotMatch(verifier, /playwright|chromium|selenium/i);
});
