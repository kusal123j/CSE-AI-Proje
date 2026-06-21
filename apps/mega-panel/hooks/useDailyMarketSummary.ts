import { useAsyncData } from './useAsyncData';
import { getLatestDailyMarketSummary, runDailyMarketSummaryImport } from '@/lib/api/cse';

export function useDailyMarketSummary() {
  const latest = useAsyncData(getLatestDailyMarketSummary, []);

  return {
    ...latest,
    async runImport() {
      const result = await runDailyMarketSummaryImport();
      await latest.reload();
      return result;
    }
  };
}
