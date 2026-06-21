export function normalizeCompanyName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toUpperCase();
}

export function normalizeSymbol(value: string): string {
  return value.replace(/\s+/g, '').trim().toUpperCase();
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw = String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/,/g, '')
    .replace(/%/g, '')
    .trim();

  if (!raw || raw === '-' || raw.toUpperCase() === 'N/A') return null;
  const parsed = Number(raw.replace(/^\+/, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeSignedPercent(changeAmount: number | null, changePercent: number | null): number | null {
  if (changePercent === null) return null;
  if (changeAmount === null || changeAmount === 0) return changePercent;
  const absolutePercent = Math.abs(changePercent);
  return changeAmount < 0 ? -absolutePercent : absolutePercent;
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ');
}

export function cleanLogoUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const decoded = decodeHtmlEntities(value)
    .replace(/^url\((.*)\)$/i, '$1')
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/['"]+$/g, '')
    .trim();

  if (!/^https?:\/\//i.test(decoded)) return null;
  return decoded;
}

export function resolveCseUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const decoded = decodeHtmlEntities(value).trim();
  if (!decoded) return null;
  if (/^https?:\/\//i.test(decoded)) return decoded;
  if (decoded.startsWith('/')) return `https://www.cse.lk${decoded}`;
  return decoded;
}
