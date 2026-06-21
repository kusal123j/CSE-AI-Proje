'use client';

import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { SecuritiesTable } from '@/components/tables/SecuritiesTable';
import { BackendMissingState } from '@/components/cse/BackendMissingState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useSecurities } from '@/hooks/useSecurities';
import type { CseSecurity } from '@/lib/types/cse';

function hasMarketData(row: CseSecurity) {
  return row.latest_snapshot_date || row.last_traded_price !== undefined || row.turnover !== undefined;
}

export default function SecuritiesPage() {
  const [search, setSearch] = useState('');
  const [changeFilter, setChangeFilter] = useState('all');
  const [dataFilter, setDataFilter] = useState('all');
  const securities = useSecurities(search, 200);

  const filtered = useMemo(() => {
    return (securities.data || []).filter((row) => {
      const change = Number(row.change_percent || row.change_amount || 0);
      if (changeFilter === 'positive' && !(change > 0)) return false;
      if (changeFilter === 'negative' && !(change < 0)) return false;
      if (changeFilter === 'no-change' && change !== 0) return false;
      if (dataFilter === 'has-data' && !hasMarketData(row)) return false;
      if (dataFilter === 'no-data' && hasMarketData(row)) return false;
      return true;
    });
  }, [securities.data, changeFilter, dataFilter]);

  return (
    <div>
      <PageHeader title="Securities / Symbols" description="Symbol-level CSE securities with latest internally saved market snapshot values where available." actions={<Button variant="secondary" onClick={() => { void securities.reload(); }}>Refresh</Button>} />
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by symbol or company" />
        <Select value={changeFilter} onChange={(event) => setChangeFilter(event.target.value)}>
          <option value="all">All change directions</option>
          <option value="positive">Positive change</option>
          <option value="negative">Negative change</option>
          <option value="no-change">No change</option>
        </Select>
        <Select value={dataFilter} onChange={(event) => setDataFilter(event.target.value)}>
          <option value="all">All trading data states</option>
          <option value="has-data">Has trading data</option>
          <option value="no-data">No trading data</option>
        </Select>
        <div className="rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted-foreground">{filtered.length} visible symbols</div>
      </div>
      <Alert tone="info" className="mb-4">Market values are shown only when the backend securities endpoint includes latest snapshot fields. No CSE Gainers/Losers tabs are used.</Alert>
      {securities.loading ? <Skeleton className="h-96" /> : securities.error ? <BackendMissingState error={securities.error} expectedEndpoint="GET /api/cse/securities" /> : <SecuritiesTable securities={filtered} />}
    </div>
  );
}
