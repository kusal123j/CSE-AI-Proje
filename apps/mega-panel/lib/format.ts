export function formatNumber(value: unknown, options?: Intl.NumberFormatOptions): string {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return new Intl.NumberFormat('en-LK', options).format(numeric);
}

export function formatCurrency(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return `Rs. ${formatNumber(numeric, { maximumFractionDigits: 2 })}`;
}

export function formatPercent(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return `${numeric > 0 ? '+' : ''}${formatNumber(numeric, { maximumFractionDigits: 2 })}%`;
}

export function formatDateTime(value: unknown): string {
  if (!value || typeof value !== 'string') return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-LK', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Colombo'
  }).format(date);
}

export function formatDate(value: unknown): string {
  if (!value || typeof value !== 'string') return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-LK', {
    dateStyle: 'medium',
    timeZone: 'Asia/Colombo'
  }).format(date);
}

export function formatDurationMs(start?: string | null, finish?: string | null): string {
  if (!start || !finish) return '—';
  const startMs = new Date(start).getTime();
  const finishMs = new Date(finish).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(finishMs)) return '—';
  const seconds = Math.max(0, Math.round((finishMs - startMs) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return `${minutes}m ${rest}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
