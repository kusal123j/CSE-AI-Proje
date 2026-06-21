'use client';

import { getCompanies } from '@/lib/api/cse';
import { useAsyncData } from './useAsyncData';

export function useCompanies(search: string, limit = 100) {
  return useAsyncData(() => getCompanies({ search, limit }), [search, limit]);
}
