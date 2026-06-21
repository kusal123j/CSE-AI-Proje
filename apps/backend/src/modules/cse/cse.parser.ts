import { ParsedCseAlphabeticalRow } from './cse.types';
import {
  cleanLogoUrl,
  decodeHtmlEntities,
  normalizeCompanyName,
  normalizeSignedPercent,
  normalizeSymbol,
  parseNumber,
  resolveCseUrl
} from './cse.normalizer';

function stripTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

function matchFirst(value: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractCells(rowHtml: string): string[] {
  const matches = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)];
  return matches.map((match) => match[1] ?? '');
}

function parseHtmlRow(rowHtml: string): ParsedCseAlphabeticalRow | null {
  const cells = extractCells(rowHtml);
  if (cells.length < 8) return null;

  const companyCell = cells[0] ?? '';
  const symbolCell = cells[1] ?? '';
  const companyName = stripTags(companyCell);
  const symbol = normalizeSymbol(stripTags(symbolCell));
  if (!companyName || !symbol || symbol.length < 3) return null;

  const profilePath = matchFirst(companyCell, [/href=["']([^"']*company-profile\?symbol=[^"']+)["']/i]);
  const styleLogo = matchFirst(companyCell, [/background-image:\s*url\(&quot;([^&]+)&quot;\)/i, /background-image:\s*url\(["']?([^"')]+)["']?\)/i]);
  const titleLogo = matchFirst(companyCell, [/data-logo=["']([^"']+)["']/i]);
  const rawChangeAmount = parseNumber(stripTags(cells[6] ?? ''));
  const rawChangePercent = parseNumber(stripTags(cells[7] ?? ''));

  return {
    companyName,
    normalizedCompanyName: normalizeCompanyName(companyName),
    symbol,
    normalizedSymbol: symbol,
    profileUrl: resolveCseUrl(profilePath),
    logoUrl: cleanLogoUrl(styleLogo ?? titleLogo),
    lastTradedPrice: parseNumber(stripTags(cells[2] ?? '')),
    tradeVolume: parseNumber(stripTags(cells[3] ?? '')),
    shareVolume: parseNumber(stripTags(cells[4] ?? '')),
    turnover: parseNumber(stripTags(cells[5] ?? '')),
    changeAmount: rawChangeAmount,
    changePercent: normalizeSignedPercent(rawChangeAmount, rawChangePercent),
    rawRow: {
      companyName,
      symbol,
      html: rowHtml
    }
  };
}

export function parseAlphabeticalHtml(html: string): ParsedCseAlphabeticalRow[] {
  const tableRows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[0]);
  const rows = tableRows.map(parseHtmlRow).filter((row): row is ParsedCseAlphabeticalRow => Boolean(row));
  return dedupeRows(rows);
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  result.push(current.trim());
  return result;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function getCsvValue(row: Record<string, string>, candidates: string[]): string {
  for (const candidate of candidates) {
    const value = row[candidate];
    if (value !== undefined) return value;
  }
  return '';
}

export function parseAlphabeticalCsv(csv: string): ParsedCseAlphabeticalRow[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map(normalizeHeader);
  const rows: ParsedCseAlphabeticalRow[] = [];

  for (const line of lines.slice(1)) {
    const values = splitCsvLine(line);
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? '';
    });

    const companyName = getCsvValue(record, ['company name', 'company']);
    const symbol = normalizeSymbol(getCsvValue(record, ['symbol', 'security symbol']));
    if (!companyName || !symbol) continue;

    const rawChangeAmount = parseNumber(getCsvValue(record, ['change rs', 'change', 'change amount']));
    const rawChangePercent = parseNumber(getCsvValue(record, ['change', 'change percent', 'change percentage']));

    rows.push({
      companyName,
      normalizedCompanyName: normalizeCompanyName(companyName),
      symbol,
      normalizedSymbol: symbol,
      profileUrl: resolveCseUrl(getCsvValue(record, ['profile url', 'profile'])),
      logoUrl: cleanLogoUrl(getCsvValue(record, ['logo url', 'logo'])),
      lastTradedPrice: parseNumber(getCsvValue(record, ['last traded price rs', 'last traded price', 'ltp'])),
      tradeVolume: parseNumber(getCsvValue(record, ['trade volume', 'trades'])),
      shareVolume: parseNumber(getCsvValue(record, ['share volume', 'volume'])),
      turnover: parseNumber(getCsvValue(record, ['turnover rs', 'turnover'])),
      changeAmount: rawChangeAmount,
      changePercent: normalizeSignedPercent(rawChangeAmount, rawChangePercent),
      rawRow: record
    });
  }

  return dedupeRows(rows);
}

export function dedupeRows(rows: ParsedCseAlphabeticalRow[]): ParsedCseAlphabeticalRow[] {
  const bySymbol = new Map<string, ParsedCseAlphabeticalRow>();
  for (const row of rows) {
    bySymbol.set(row.normalizedSymbol, row);
  }
  return [...bySymbol.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}
