'use client';

import { useMemo } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ImportControlPanel } from '@/components/cse/ImportControlPanel';
import { ImportRunSummary } from '@/components/cse/ImportRunSummary';
import { AzProgressGrid } from '@/components/cse/AzProgressGrid';
import { BackendMissingState } from '@/components/cse/BackendMissingState';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getCseImportConfig, getRawRunSummary } from '@/lib/api/cse';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useFetchRuns } from '@/hooks/useFetchRuns';

export default function CseImportPage() {
  const config = useAsyncData(getCseImportConfig, []);
  const runs = useFetchRuns(1);
  const latestRun = useMemo(() => runs.data?.[0] ?? null, [runs.data]);
  const rawSummary = useAsyncData(() => latestRun ? getRawRunSummary(latestRun.id) : Promise.resolve(null), [latestRun?.id]);

  function refreshAll() {
    void config.reload();
    void runs.reload();
    void rawSummary.reload();
  }

  return (
    <div>
      <PageHeader
        title="CSE Import Control"
        description="Manual control and visibility for the browser-only CSE Listed Company Directory ALPHABETICAL A–Z importer. This page never calls CSE export/API URLs directly."
        actions={<Button variant="secondary" onClick={refreshAll}>Refresh</Button>}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <div className="space-y-6">
          {config.error ? <BackendMissingState error={config.error} expectedEndpoint="GET /api/cse/import/config" /> : <ImportControlPanel config={config.data} onRunFinished={refreshAll} />}
          {runs.loading ? <Skeleton className="h-96" /> : runs.error ? <BackendMissingState error={runs.error} expectedEndpoint="GET /api/cse/import/runs" /> : <ImportRunSummary run={latestRun} />}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>A–Z progress grid</CardTitle>
          </CardHeader>
          {rawSummary.error ? <BackendMissingState error={rawSummary.error} expectedEndpoint="GET /api/cse/import/runs/:id/raw-summary" /> : <AzProgressGrid run={latestRun} rawSummary={rawSummary.data} />}
        </Card>
      </div>
    </div>
  );
}
