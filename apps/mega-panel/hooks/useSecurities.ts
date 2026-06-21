'use client';

import { getSecurities } from '@/lib/api/cse';
import { useAsyncData } from './useAsyncData';

export function useSecurities(search: string, limit = 100) {
  return useAsyncData(() => getSecurities({ search, limit }), [search, limit]);
}
