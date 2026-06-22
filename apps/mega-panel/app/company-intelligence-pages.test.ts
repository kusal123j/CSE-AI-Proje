import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const appDir = path.resolve(__dirname);

function read(relativePath: string) {
  return fs.readFileSync(path.join(appDir, relativePath), 'utf8');
}

describe('company intelligence Mega Panel pages', () => {
  it('company profiles page separates test batch and all-company import', () => {
    const source = read('company-profiles/page.tsx');
    expect(source).toContain('Run test batch 25');
    expect(source).toContain('Run all companies');
    expect(source).toContain("mode === 'batch' ? { limit: 25 } : undefined");
  });

  it('financial reports page monitors reports and document status', () => {
    const source = read('company-financial-reports/page.tsx');
    expect(source).toContain('getAllCompanyFinancialReports');
    expect(source).toContain('Run all companies');
    expect(source).toContain('document_status');
    expect(source).toContain('original_pdf_url');
    expect(source).toContain('auto_download_eligible');
    expect(source).toContain('document_error');
  });

  it('announcements page supports symbol and date range all-company import', () => {
    const source = read('company-announcements/page.tsx');
    expect(source).toContain('startDate');
    expect(source).toContain('endDate');
    expect(source).toContain('Run all companies');
    expect(source).toContain('getAllCompanyAnnouncements');
    expect(source).toContain('original_pdf_url');
    expect(source).toContain('auto_download_eligible');
    expect(source).toContain('document_error');
  });

  it('latest prices page exposes freshness warning for stale prices', () => {
    const source = read('latest-prices/page.tsx');
    expect(source).toContain('Stale >10m');
    expect(source).toContain('Freshness');
  });
});
