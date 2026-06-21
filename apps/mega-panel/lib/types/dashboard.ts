import type { CseFetchRun, CseSystemStatus } from './cse';

export interface CseDashboardSummary {
  companyCount: number;
  securityCount: number;
  latestMarketSnapshotDate: string | null;
  lastSuccessfulImport: CseFetchRun | null;
  lastFailedImport: CseFetchRun | null;
  totalFetchRuns: number;
  totalRawDownloadedFiles: number;
  totalGainers: number;
  totalLosers: number;
  topTurnoverCount: number;
  systemStatus: CseSystemStatus;
}
