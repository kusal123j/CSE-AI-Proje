import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';

async function loadValidator() {
  return import('./pdfValidation');
}

test('accepts a valid PDF-looking buffer', async () => {
  const { validatePdfDownload } = await loadValidator();
  const result = validatePdfDownload({
    sourceUrl: 'https://example.com/report.pdf',
    buffer: Buffer.from('%PDF-1.7\nbody'),
    contentType: 'application/pdf'
  });

  assert.equal(result.normalizedContentType, 'application/pdf');
  assert.equal(result.fileSize, 13);
});

test('rejects a non-PDF buffer', async () => {
  const { validatePdfDownload } = await loadValidator();
  assert.throws(
    () =>
      validatePdfDownload({
        sourceUrl: 'https://example.com/report.pdf',
        buffer: Buffer.from('<html>error</html>'),
        contentType: 'text/html'
      }),
    /Header check failed/
  );
});

test('rejects non-http URLs', async () => {
  const { validatePdfDownload } = await loadValidator();
  assert.throws(
    () =>
      validatePdfDownload({
        sourceUrl: 'ftp://example.com/report.pdf',
        buffer: Buffer.from('%PDF-1.7')
      }),
    /HTTP\/HTTPS/
  );
});
