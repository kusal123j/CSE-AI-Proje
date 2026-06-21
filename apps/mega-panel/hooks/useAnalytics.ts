'use client';

import { getMarketBreadth, getMarketGainers, getMarketLosers, getTopShareVolume, getTopTradeVolume, getTopTurnover, getWatchListMovers } from '@/lib/api/cse';
import { useAsyncData } from './useAsyncData';

export function useAnalytics(date?: string, limit = 10) {
  return useAsyncData(
    async () => {
      const params = { date, limit };
      const [breadth, gainers, losers, topTurnover, topTradeVolume, topShareVolume, watchListMovers] = await Promise.all([
        getMarketBreadth({ date }),
        getMarketGainers(params),
        getMarketLosers(params),
        getTopTurnover(params),
        getTopTradeVolume(params),
        getTopShareVolume(params),
        getWatchListMovers(params)
      ]);
      return { breadth, gainers, losers, topTurnover, topTradeVolume, topShareVolume, watchListMovers };
    },
    [date, limit]
  );
}
