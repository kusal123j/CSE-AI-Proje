export function safeFileName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

export function upperSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}
