import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { assertCsePdfUrl, normalizeCsePdfUrl } from './cse.sourceGuard';

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

test('CSE PDF source guard normalizes API and relative upload_report_file paths to CDN URLs', () => {
  const expected = 'https://cdn.cse.lk/cmt/upload_report_file/510_1781521818535.pdf';
  assert.equal(normalizeCsePdfUrl('https://www.cse.lk/api/cmt/upload_report_file/510_1781521818535.pdf'), expected);
  assert.equal(normalizeCsePdfUrl('/api/cmt/upload_report_file/510_1781521818535.pdf'), expected);
  assert.equal(normalizeCsePdfUrl('/cmt/upload_report_file/510_1781521818535.pdf'), expected);
  assert.equal(normalizeCsePdfUrl('cmt/upload_report_file/510_1781521818535.pdf'), expected);
  assert.doesNotThrow(() => assertCsePdfUrl(expected));
  assert.equal(normalizeCsePdfUrl('https://cdn.cse.lk/cmt/upload_report_file/510_1781521818535.pdf'), expected);
  assert.throws(() => assertCsePdfUrl('https://example.com/report.pdf'));
  assert.throws(() => assertCsePdfUrl('https://evil.example/cmt/upload_report_file/510_1781521818535.pdf'));
  assert.throws(() => assertCsePdfUrl('javascript:alert(1)'));
  assert.throws(() => assertCsePdfUrl('data:application/pdf;base64,abcd'));
  assert.throws(() => assertCsePdfUrl('https://cdn.cse.lk/cmt/upload_report_file/not-a-pdf.xlsx'));
});

test('CSE company intelligence service sanitizes PDF URLs before document creation', () => {
  const service = fs.readFileSync(path.resolve(__dirname, 'cse.companyIntelligence.service.ts'), 'utf8');
  const repository = fs.readFileSync(path.resolve(__dirname, 'cse.companyIntelligence.repository.ts'), 'utf8');

  assert.match(service, /sanitizePdfInput/);
  assert.match(service, /normalizeCsePdfUrl\(rawPdfUrl\)/);
  assert.match(repository, /assertAllowedCsePdfUrl\(input\.sourceUrl\)/);
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


test('CSE company intelligence implements selected auto-download policy', () => {
  const service = fs.readFileSync(path.resolve(__dirname, 'cse.companyIntelligence.service.ts'), 'utf8');
  const repository = fs.readFileSync(path.resolve(__dirname, 'cse.companyIntelligence.repository.ts'), 'utf8');

  assert.match(repository, /refreshFinancialReportAutoDownloadEligibility/);
  assert.match(repository, /LATEST_ANNUAL_REPORT/);
  assert.match(repository, /LATEST_4_INTERIM_REPORTS/);
  assert.match(repository, /rn <= 1/);
  assert.match(repository, /rn <= 4/);
  assert.match(repository, /IMPORTANT_RECENT_ANNOUNCEMENT/);
  assert.match(service, /queueDocumentDownloads\(documentIds\)/);
  assert.match(service, /selectAutoDownloadFinancialReportsForSymbol/);
  assert.match(service, /classifyAnnouncementAutoDownload/);
});

test('CSE document-ingestion correction hardens retry, duplicate, and unknown-date announcement policy', () => {
  const repository = fs.readFileSync(path.resolve(__dirname, 'cse.companyIntelligence.repository.ts'), 'utf8');
  const reportPage = fs.readFileSync(path.resolve(__dirname, '../../../../mega-panel/app/company-financial-reports/page.tsx'), 'utf8');
  const announcementPage = fs.readFileSync(path.resolve(__dirname, '../../../../mega-panel/app/company-announcements/page.tsx'), 'utf8');

  assert.match(repository, /SAVEPOINT cse_document_insert/);
  assert.match(repository, /SELECT \* FROM documents WHERE source_url = \$1 LIMIT 1/);
  assert.match(repository, /BUSINESS_KEY_CONFLICT_DISTINCT_SOURCE_URL/);
  assert.match(repository, /UNKNOWN_DATE_METADATA_ONLY/);
  assert.match(repository, /AND published_date IS NOT NULL/);
  assert.match(repository, /retryPdfSourceFromRow\(report, 'CSE financial report'\)/);
  assert.match(repository, /retryPdfSourceFromRow\(announcement, 'CSE announcement'\)/);
  assert.match(reportPage, /CDN PDF/);
  assert.match(reportPage, /ShortText/);
  assert.match(announcementPage, /CDN PDF/);
  assert.match(announcementPage, /ShortText/);
});
