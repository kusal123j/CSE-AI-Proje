import { env } from '../config/env';

export interface PdfValidationInput {
  sourceUrl: string;
  buffer: Buffer;
  contentType?: string | null;
  contentLength?: number | null;
}

export interface PdfValidationResult {
  normalizedContentType: string;
  fileSize: number;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validatePdfDownload(input: PdfValidationInput): PdfValidationResult {
  if (!isHttpUrl(input.sourceUrl)) {
    throw new Error('sourceUrl must be a valid HTTP/HTTPS URL');
  }

  const fileSize = input.buffer.length;
  const maxBytes = env.MAX_PDF_SIZE_MB * 1024 * 1024;

  if (fileSize <= 0) {
    throw new Error('Downloaded file is empty');
  }

  if (fileSize > maxBytes) {
    throw new Error(`Downloaded PDF exceeds max size limit of ${env.MAX_PDF_SIZE_MB} MB`);
  }

  if (input.contentLength && input.contentLength > maxBytes) {
    throw new Error(`PDF response Content-Length exceeds max size limit of ${env.MAX_PDF_SIZE_MB} MB`);
  }

  const header = input.buffer.subarray(0, 5).toString('utf8');
  if (header !== '%PDF-') {
    throw new Error('Downloaded file is not a valid PDF. Header check failed.');
  }

  const contentType = (input.contentType || '').split(';')[0].trim().toLowerCase();
  const urlPath = new URL(input.sourceUrl).pathname.toLowerCase();
  const hasPdfExtension = urlPath.endsWith('.pdf');
  const looksLikePdfMime = contentType === 'application/pdf' || contentType === 'application/octet-stream';

  if (contentType && !looksLikePdfMime && !hasPdfExtension) {
    throw new Error(`Downloaded response is not a PDF. content-type=${contentType}`);
  }

  return {
    normalizedContentType: 'application/pdf',
    fileSize
  };
}
