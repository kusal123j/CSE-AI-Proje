'use client';

import { PageHeader } from '@/components/layout/PageHeader';
import { FetchRunsTable } from '@/components/tables/FetchRunsTable';
import { BackendMissingState } from '@/components/cse/BackendMissingState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFetchRuns } from '@/hooks/useFetchRuns';

export default function FetchRunsPage() {
  const runs = useFetchRuns(100);
  return (
    <div>
      <PageHeader title="Fetch Runs" description="All recorded CSE A–Z import runs, including successes, partial successes, and failures." actions={<Button variant="secondary" onClick={() => { void runs.reload(); }}>Refresh</Button>} />
      {runs.loading ? <Skeleton className="h-96" /> : runs.error ? <BackendMissingState error={runs.error} expectedEndpoint="GET /api/cse/import/runs" /> : <FetchRunsTable runs={runs.data || []} />}
    </div>
  );
}
