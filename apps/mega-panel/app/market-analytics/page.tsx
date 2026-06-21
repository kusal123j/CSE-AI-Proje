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
import { Badge } from '@/components/ui/badge';
import { formatNumber } from '@/lib/format';
import { useAnalytics } from '@/hooks/useAnalytics';

function BreadthCard({ label, value }: { label: string; value: number | string | null | undefined }) {
  return (
    <Card>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-bold">{typeof value === 'number' ? formatNumber(value) : value ?? '—'}</div>
    </Card>
  );
}

export default function MarketAnalyticsPage() {
  const [date, setDate] = useState('');
  const [limit, setLimit] = useState(10);
  const [metric, setMetric] = useState('topTradeVolume');
  const analytics = useAnalytics(date, limit);
  const selectedRows = analytics.data ? analytics.data[metric as keyof Omit<typeof analytics.data, 'breadth'>] : [];
  const breadth = analytics.data?.breadth;

  return (
    <div>
      <PageHeader
        title="Market Analytics"
        description="Internally calculated rankings from saved CSE Trade Summary daily market snapshots. This page does not fetch separate CSE Gainers, Losers, Turnover, or Volume tabs."
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
          <option value="topTradeVolume">Top trade volume</option>
          <option value="topShareVolume">Top share volume</option>
          <option value="topTurnover">Top turnover</option>
          <option value="watchListMovers">Watch List movers</option>
        </Select>
      </div>

      {analytics.loading ? <Skeleton className="h-[620px]" /> : analytics.error ? <BackendMissingState error={analytics.error} expectedEndpoint="GET /api/cse/market/* analytics endpoints" /> : analytics.data ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="success">Trade Summary source</Badge>
            <span className="text-sm text-muted-foreground">Market date: {breadth?.tradingDate || date || 'latest available'}</span>
          </div>
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <BreadthCard label="Gainers" value={breadth?.gainersCount} />
            <BreadthCard label="Losers" value={breadth?.losersCount} />
            <BreadthCard label="Unchanged" value={breadth?.unchangedCount} />
            <BreadthCard label="Watch List" value={breadth?.watchListCount} />
            <BreadthCard label="Total shares" value={breadth?.totalShareVolume} />
            <BreadthCard label="Total trades" value={breadth?.totalTradeVolume} />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <GainersLosersBarChart rows={analytics.data.gainers} title="Top gainers by %" />
            <GainersLosersBarChart rows={analytics.data.losers} title="Top losers by %" />
            <TurnoverBarChart rows={analytics.data.topShareVolume.map((row) => ({ ...row, turnover: row.share_volume }))} title="Top share volume" />
            <TurnoverBarChart rows={analytics.data.topTradeVolume.map((row) => ({ ...row, turnover: row.trade_volume }))} title="Top trade volume" />
          </div>
          <Card>
            <CardHeader><CardTitle>Full ranking table</CardTitle></CardHeader>
            <AnalyticsRankingTable rows={Array.isArray(selectedRows) ? selectedRows : []} />
          </Card>
        </div>
      ) : null}
    </div>
  );
}
