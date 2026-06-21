'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { GainersLosersBarChart } from '@/components/charts/GainersLosersBarChart';
import { TurnoverBarChart } from '@/components/charts/TurnoverBarChart';
import { AnalyticsRankingTable } from '@/components/tables/AnalyticsRankingTable';
import { BackendMissingState } from '@/components/cse/BackendMissingState';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAnalytics } from '@/hooks/useAnalytics';

export default function MarketAnalyticsPage() {
  const [date, setDate] = useState('');
  const [limit, setLimit] = useState(10);
  const [metric, setMetric] = useState('topTurnover');
  const analytics = useAnalytics(date, limit);
  const selectedRows = analytics.data ? analytics.data[metric as keyof typeof analytics.data] : [];

  return (
    <div>
      <PageHeader
        title="Market Analytics"
        description="Internally calculated rankings from saved ALPHABETICAL daily snapshots. This page must never fetch CSE Gainers, Losers, Turnover, or Volume tabs."
        actions={<Button variant="secondary" onClick={() => { void analytics.reload(); }}>Refresh</Button>}
      />
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        <Select value={String(limit)} onChange={(event) => setLimit(Number(event.target.value))}>
          <option value="5">Top 5</option>
          <option value="10">Top 10</option>
          <option value="25">Top 25</option>
          <option value="50">Top 50</option>
        </Select>
        <Select value={metric} onChange={(event) => setMetric(event.target.value)}>
          <option value="gainers">Top gainers</option>
          <option value="losers">Top losers</option>
          <option value="topTurnover">Top turnover</option>
          <option value="topTradeVolume">Top trade volume</option>
          <option value="topShareVolume">Top share volume</option>
        </Select>
      </div>

      {analytics.loading ? <Skeleton className="h-[620px]" /> : analytics.error ? <BackendMissingState error={analytics.error} expectedEndpoint="GET /api/cse/market/* analytics endpoints" /> : analytics.data ? (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <TurnoverBarChart rows={analytics.data.topTurnover} />
            <GainersLosersBarChart rows={analytics.data.gainers} title="Top gainers by %" />
            <GainersLosersBarChart rows={analytics.data.losers} title="Top losers by %" />
            <TurnoverBarChart rows={analytics.data.topShareVolume.map((row) => ({ ...row, turnover: row.share_volume }))} title="Top share volume" />
          </div>
          <Card>
            <CardHeader><CardTitle>Full ranking table</CardTitle></CardHeader>
            <AnalyticsRankingTable rows={selectedRows || []} />
          </Card>
        </div>
      ) : null}
    </div>
  );
}
