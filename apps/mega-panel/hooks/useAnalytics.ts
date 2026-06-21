'use client';

import { getMarketGainers, getMarketLosers, getTopShareVolume, getTopTradeVolume, getTopTurnover } from '@/lib/api/cse';
import { useAsyncData } from './useAsyncData';

export function useAnalytics(date?: string, limit = 10) {
  return useAsyncData(
    async () => {
      const params = { date, limit };
      const [gainers, losers, topTurnover, topTradeVolume, topShareVolume] = await Promise.all([
        getMarketGainers(params),
        getMarketLosers(params),
        getTopTurnover(params),
        getTopTradeVolume(params),
        getTopShareVolume(params)
      ]);
      return { gainers, losers, topTurnover, topTradeVolume, topShareVolume };
    },
    [date, limit]
  );
}
