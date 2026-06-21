'use client';

import { getCseFetchRuns } from '@/lib/api/cse';
import { useAsyncData } from './useAsyncData';

export function useFetchRuns(limit = 50) {
  return useAsyncData(() => getCseFetchRuns({ limit }), [limit]);
}
