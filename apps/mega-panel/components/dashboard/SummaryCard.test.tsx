import { describe, expect, it } from 'vitest';
import { formatCurrency, formatDateTime, formatNumber, formatPercent } from '@/lib/format';

describe('dashboard formatting helpers', () => {
  it('formats numbers, percentages, and currency values for dashboard cards', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatPercent(12.345)).toBe('+12.35%');
    expect(formatCurrency(98765.4)).toContain('98,765.4');
  });

  it('formats missing date values as unavailable', () => {
    expect(formatDateTime(undefined)).toBe('—');
    expect(formatDateTime(null)).toBe('—');
  });
});
