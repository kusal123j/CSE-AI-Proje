import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { assertCsePdfUrl } from './cse.sourceGuard';

test('CSE company intelligence schedulers include financial reports and announcements', () => {
  const scheduler = fs.readFileSync(path.resolve(__dirname, 'cse.scheduler.ts'), 'utf8');
  const server = fs.readFileSync(path.resolve(__dirname, '../../server.ts'), 'utf8');

  assert.match(scheduler, /startCseCompanyFinancialReportsScheduler/);
  assert.match(scheduler, /startCseCompanyAnnouncementsScheduler/);
  assert.match(scheduler, /startFinancialReportsImport\(\{ triggerType: 'scheduled' \}\)/);
  assert.match(scheduler, /startAnnouncementsImport\(\{ triggerType: 'scheduled' \}\)/);
  assert.match(server, /startCseCompanyFinancialReportsScheduler\(\)/);
  assert.match(server, /startCseCompanyAnnouncementsScheduler\(\)/);
});

test('CSE PDF source guard accepts only CSE-hosted PDF URLs', () => {
  assert.doesNotThrow(() => assertCsePdfUrl('https://cdn.cse.lk/cmt/upload_report_file/AFSL_annual.pdf'));
  assert.doesNotThrow(() => assertCsePdfUrl('https://www.cse.lk/cmt/upload_report_file/AFSL_annual.pdf'));
  assert.throws(() => assertCsePdfUrl('https://example.com/report.pdf'));
  assert.throws(() => assertCsePdfUrl('https://cdn.cse.lk/cmt/upload_report_file/not-a-pdf.xlsx'));
});

test('CSE company intelligence service sanitizes PDF URLs before document creation', () => {
  const service = fs.readFileSync(path.resolve(__dirname, 'cse.companyIntelligence.service.ts'), 'utf8');
  const repository = fs.readFileSync(path.resolve(__dirname, 'cse.companyIntelligence.repository.ts'), 'utf8');

  assert.match(service, /sanitizePdfInput/);
  assert.match(service, /assertCsePdfUrl\(input\.pdfUrl\)/);
  assert.match(repository, /assertCsePdfUrl\(input\.sourceUrl\)/);
});

test('Mega Panel supports Run all companies and Test batch without silent 25 limit', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../../../mega-panel/app/company-profiles/page.tsx'), 'utf8');
  assert.match(page, /Run test batch 25/);
  assert.match(page, /Run all companies/);
  assert.match(page, /runCompanyProfilesImport\(mode === 'batch' \? \{ limit: 25 \} : undefined\)/);
});

test('Mega Panel has report and announcement monitoring endpoints and tables', () => {
  const api = fs.readFileSync(path.resolve(__dirname, '../../../../mega-panel/lib/api/cse.ts'), 'utf8');
  const reportPage = fs.readFileSync(path.resolve(__dirname, '../../../../mega-panel/app/company-financial-reports/page.tsx'), 'utf8');
  const announcementPage = fs.readFileSync(path.resolve(__dirname, '../../../../mega-panel/app/company-announcements/page.tsx'), 'utf8');

  assert.match(api, /getAllCompanyFinancialReports/);
  assert.match(api, /getAllCompanyAnnouncements/);
  assert.match(reportPage, /Run all companies/);
  assert.match(reportPage, /Document/);
  assert.match(announcementPage, /Run all companies/);
  assert.match(announcementPage, /Category filter/);
});
