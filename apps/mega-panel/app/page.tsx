'use client';

import { PageHeader } from '@/components/layout/PageHeader';
import { SummaryCard } from '@/components/dashboard/SummaryCard';
import { SystemStatusCard } from '@/components/dashboard/SystemStatusCard';
import { FetchRunsTable } from '@/components/tables/FetchRunsTable';
import { BackendMissingState } from '@/components/cse/BackendMissingState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCseSummary } from '@/hooks/useCseSummary';
import { useFetchRuns } from '@/hooks/useFetchRuns';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';

export default function DashboardPage() {
  const summary = useCseSummary();
  const runs = useFetchRuns(8);

  return (
    <div>
      <PageHeader
        title="Dashboard Overview"
        description="A founder/developer overview of CSE data coverage, import health, stored market data, and internal analytics readiness."
        actions={<Button variant="secondary" onClick={() => { void summary.reload(); void runs.reload(); }}>Refresh</Button>}
      />

      {summary.loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : summary.error ? (
        <BackendMissingState error={summary.error} expectedEndpoint="GET /api/cse/summary" />
      ) : summary.data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="Total companies" value={formatNumber(summary.data.companyCount)} />
            <SummaryCard label="Total securities" value={formatNumber(summary.data.securityCount)} />
            <SummaryCard label="Latest market date" value={formatDate(summary.data.latestMarketSnapshotDate || undefined)} />
            <SummaryCard label="Last successful import" value={formatDateTime(summary.data.lastSuccessfulImport?.finished_at || undefined)} />
            <SummaryCard label="Last failed import" value={formatDateTime(summary.data.lastFailedImport?.finished_at || undefined)} />
            <SummaryCard label="Total fetch runs" value={formatNumber(summary.data.totalFetchRuns)} />
            <SummaryCard label="Raw downloaded files" value={formatNumber(summary.data.totalRawDownloadedFiles)} helper="Derived from stored fetch-run letter counts." />
            <SummaryCard label="Total gainers" value={formatNumber(summary.data.totalGainers)} />
            <SummaryCard label="Total losers" value={formatNumber(summary.data.totalLosers)} />
            <SummaryCard label="Top turnover count" value={formatNumber(summary.data.topTurnoverCount)} />
          </div>
          <div className="mt-6">
            <SystemStatusCard summary={summary.data} />
          </div>
        </>
      ) : null}

      <div className="mt-8">
        <PageHeader title="Recent fetch runs" description="Latest CSE HTTP/API A–Z import executions recorded by the backend." />
        {runs.loading ? <Skeleton className="h-72" /> : runs.error ? <BackendMissingState error={runs.error} expectedEndpoint="GET /api/cse/import/runs" /> : <FetchRunsTable runs={runs.data || []} />}
      </div>
    </div>
  );
}
