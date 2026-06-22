'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { BackendMissingState } from '@/components/cse/BackendMissingState';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableContainer } from '@/components/ui/table';
import { getLatestPriceMarketStatus, getLatestPrices, runLatestPricesImport } from '@/lib/api/cse';
import { useAsyncData } from '@/hooks/useAsyncData';

function text(value: unknown) {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

function priceFreshness(updatedAt?: string | null) {
  if (!updatedAt) return 'Missing';
  const minutes = (Date.now() - new Date(updatedAt).getTime()) / 60000;
  if (!Number.isFinite(minutes)) return 'Unknown';
  return minutes > 10 ? 'Stale >10m' : 'Fresh';
}

export default function LatestPricesPage() {
  const [search, setSearch] = useState('');
  const [running, setRunning] = useState(false);
  const prices = useAsyncData(() => getLatestPrices({ search, limit: 300 }), [search]);
  const marketStatus = useAsyncData(() => getLatestPriceMarketStatus(), []);

  async function runImport() {
    setRunning(true);
    try {
      await runLatestPricesImport({ insertSnapshot: true });
      await prices.reload();
      await marketStatus.reload();
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <PageHeader title="Latest Prices" description="Bulk latest-price cache from the CSE todaySharePrice flow. Use this instead of per-company scraping. Freshness becomes stale when market-open prices are older than 10 minutes." actions={<Button onClick={runImport} disabled={running}>{running ? 'Starting…' : 'Run latest price now'}</Button>} />
      <Card className="mb-6"><CardHeader><CardTitle>Search latest prices</CardTitle></CardHeader><div className="grid gap-4 md:grid-cols-2"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search symbol or company" /><div className="rounded-xl border p-4 text-sm"><div className="font-semibold">Market status</div><div>Status: {text(marketStatus.data?.status)}</div><div>Open: {marketStatus.data?.is_open === true ? 'Yes' : marketStatus.data?.is_open === false ? 'No' : 'Unknown'}</div><div>Source: {text(marketStatus.data?.source)}</div><div>Checked: {text(marketStatus.data?.checked_at)}</div></div></div></Card>
      {prices.loading ? <Skeleton className="h-96" /> : prices.error ? <BackendMissingState error={prices.error} expectedEndpoint="GET /api/cse/latest-prices" /> : (
        <TableContainer>
          <Table>
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Symbol</th><th className="px-4 py-3">Company</th><th className="px-4 py-3">LTP</th><th className="px-4 py-3">Change</th><th className="px-4 py-3">%</th><th className="px-4 py-3">Turnover</th><th className="px-4 py-3">Updated</th><th className="px-4 py-3">Freshness</th></tr></thead>
            <tbody className="divide-y divide-border">{(prices.data ?? []).map((price) => <tr key={price.id}><td className="px-4 py-3 font-semibold text-primary">{price.symbol}</td><td className="px-4 py-3">{text(price.company_name)}</td><td className="px-4 py-3">{text(price.last_traded_price)}</td><td className="px-4 py-3">{text(price.change_amount)}</td><td className="px-4 py-3">{text(price.change_percent)}</td><td className="px-4 py-3">{text(price.turnover)}</td><td className="px-4 py-3 text-xs text-muted-foreground">{text(price.updated_at)}</td><td className="px-4 py-3">{priceFreshness(price.updated_at)}</td></tr>)}</tbody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
}
