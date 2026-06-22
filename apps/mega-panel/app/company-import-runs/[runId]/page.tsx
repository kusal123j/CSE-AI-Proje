'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { BackendMissingState } from '@/components/cse/BackendMissingState';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableContainer } from '@/components/ui/table';
import { getImportRunSymbolResults, retryFailedImportSymbols } from '@/lib/api/cse';
import { useAsyncData } from '@/hooks/useAsyncData';

function text(value: unknown) {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

export default function CompanyImportRunDetailPage({ params }: { params: { runId: string } }) {
  const runId = params.runId;
  const [status, setStatus] = useState('');
  const [importType, setImportType] = useState('');
  const [symbol, setSymbol] = useState('');
  const [message, setMessage] = useState('');
  const [runningRetry, setRunningRetry] = useState(false);
  const results = useAsyncData(() => getImportRunSymbolResults(runId, { status, importType, symbol, limit: 300 }), [runId, status, importType, symbol]);

  async function retryFailed() {
    if (!importType.trim()) {
      setMessage('Select/importType filter first: COMPANY_PROFILE, FINANCIAL_REPORTS, ANNOUNCEMENTS, or LATEST_PRICES.');
      return;
    }
    if (!window.confirm('Retry failed symbols only for this run/import type?')) return;
    setRunningRetry(true);
    setMessage('');
    try {
      const result = await retryFailedImportSymbols(runId, { importType: importType.trim().toUpperCase() });
      setMessage(`Retry started: ${JSON.stringify(result)}`);
      await results.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to retry failed symbols');
    } finally {
      setRunningRetry(false);
    }
  }

  const summary = results.data?.summary;

  return (
    <div>
      <PageHeader title="CSE Import Run Details" description="Per-symbol status and retry controls for CSE company-intelligence imports." />
      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Run {runId}</CardTitle>
            <CardDescription>Filter failed/warning symbols, inspect errors, and retry only failed symbols.</CardDescription>
          </div>
        </CardHeader>
        <div className="grid gap-4 md:grid-cols-3">
          <Input value={status} onChange={(event) => setStatus(event.target.value.toUpperCase())} placeholder="Status e.g. FAILED" />
          <Input value={importType} onChange={(event) => setImportType(event.target.value.toUpperCase())} placeholder="Import type e.g. FINANCIAL_REPORTS" />
          <Input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder="Symbol e.g. AFSL.N0000" />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Total</div><div className="text-xl font-semibold">{text(summary?.total)}</div></div>
          <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Success</div><div className="text-xl font-semibold">{text(summary?.success)}</div></div>
          <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Failed</div><div className="text-xl font-semibold">{text(summary?.failed)}</div></div>
          <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Warning</div><div className="text-xl font-semibold">{text(summary?.warning)}</div></div>
          <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Skipped</div><div className="text-xl font-semibold">{text(summary?.skipped)}</div></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={retryFailed} disabled={runningRetry}>{runningRetry ? 'Starting retry…' : 'Retry failed symbols'}</Button>
          <Button variant="secondary" onClick={() => results.reload()}>Refresh</Button>
        </div>
        {message ? <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-muted p-4 text-xs text-muted-foreground">{message}</pre> : null}
      </Card>

      {results.loading ? <Skeleton className="h-96" /> : results.error ? <BackendMissingState error={results.error} expectedEndpoint="GET /api/cse/import/runs/:id/symbol-results" /> : (
        <TableContainer>
          <Table>
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Symbol</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Records</th><th className="px-4 py-3">Docs</th><th className="px-4 py-3">Announcements</th><th className="px-4 py-3">Error</th><th className="px-4 py-3">Finished</th></tr></thead>
            <tbody className="divide-y divide-border">{(results.data?.items ?? []).map((item) => <tr key={item.id}><td className="px-4 py-3 font-semibold text-primary"><Link href={`/company-profiles/${encodeURIComponent(item.symbol)}`}>{item.symbol}</Link></td><td className="px-4 py-3">{item.import_type}</td><td className="px-4 py-3">{item.status}</td><td className="px-4 py-3">{text(item.records_found)}</td><td className="px-4 py-3">{text(item.documents_discovered)}</td><td className="px-4 py-3">{text(item.announcements_discovered)}</td><td className="px-4 py-3 max-w-md text-xs text-muted-foreground">{text(item.error_message)}</td><td className="px-4 py-3 text-xs text-muted-foreground">{text(item.finished_at)}</td></tr>)}</tbody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
}
