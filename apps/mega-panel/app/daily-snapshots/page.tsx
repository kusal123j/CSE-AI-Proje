'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DailySnapshotsTable } from '@/components/tables/DailySnapshotsTable';
import { BackendMissingState } from '@/components/cse/BackendMissingState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDailySnapshots } from '@/hooks/useDailySnapshots';

export default function DailySnapshotsPage() {
  const [date, setDate] = useState('');
  const [search, setSearch] = useState('');
  const snapshots = useDailySnapshots({ date, search, limit: 200 });
  return (
    <div>
      <PageHeader title="Daily Market Snapshots" description="Saved daily market rows from the official ALPHABETICAL CSE import. Includes raw-row viewing for debugging parser behavior." actions={<Button variant="secondary" onClick={() => { void snapshots.reload(); }}>Refresh</Button>} />
      <div className="mb-4 grid gap-3 md:grid-cols-[220px_1fr_auto]">
        <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search symbol or company" />
        <div className="rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted-foreground">{snapshots.data?.length || 0} visible rows</div>
      </div>
      {snapshots.loading ? <Skeleton className="h-96" /> : snapshots.error ? <BackendMissingState error={snapshots.error} expectedEndpoint="GET /api/cse/market/daily" /> : <DailySnapshotsTable snapshots={snapshots.data || []} />}
    </div>
  );
}
