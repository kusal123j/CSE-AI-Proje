'use client';

import { getDashboardSummary } from '@/lib/api/cse';
import { useAsyncData } from './useAsyncData';

export function useCseSummary() {
  return useAsyncData(getDashboardSummary, []);
}
