'use client';

import { getDailySnapshots } from '@/lib/api/cse';
import { useAsyncData } from './useAsyncData';

export function useDailySnapshots(params: { date?: string; search?: string; limit?: number }) {
  return useAsyncData(() => getDailySnapshots(params), [params.date, params.search, params.limit]);
}
