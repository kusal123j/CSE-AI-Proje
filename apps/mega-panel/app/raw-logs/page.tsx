'use client';

import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { BackendMissingState } from '@/components/cse/BackendMissingState';
import { FetchRunStatusBadge } from '@/components/cse/FetchRunStatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert } from '@/components/ui/alert';
import { useFetchRuns } from '@/hooks/useFetchRuns';
import { useAsyncData } from '@/hooks/useAsyncData';
import { getRawRunSummary } from '@/lib/api/cse';
import { formatDateTime, formatNumber } from '@/lib/format';

export default function RawLogsPage() {
  const runs = useFetchRuns(50);
  const [selectedRunId, setSelectedRunId] = useState('');
  const effectiveRunId = selectedRunId || runs.data?.[0]?.id || '';
  const rawSummary = useAsyncData(() => effectiveRunId ? getRawRunSummary(effectiveRunId) : Promise.resolve(null), [effectiveRunId]);
  const selectedRun = useMemo(() => runs.data?.find((run) => run.id === effectiveRunId) || runs.data?.[0] || null, [runs.data, effectiveRunId]);

  return (
    <div>
      <PageHeader title="Raw Data / Logs" description="Raw storage folders, downloaded A–Z files, merged normalized JSON path, warnings, parse errors, and backend error messages." actions={<Button variant="secondary" onClick={() => { void runs.reload(); void rawSummary.reload(); }}>Refresh</Button>} />
      {runs.loading ? <Skeleton className="h-96" /> : runs.error ? <BackendMissingState error={runs.error} expectedEndpoint="GET /api/cse/import/runs" /> : (
        <div className="space-y-6">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Select value={effectiveRunId} onChange={(event) => setSelectedRunId(event.target.value)}>
              {(runs.data || []).map((run) => <option value={run.id} key={run.id}>{run.id} · {run.status} · {formatDateTime(run.started_at || undefined)}</option>)}
            </Select>
            {selectedRun ? <FetchRunStatusBadge status={selectedRun.status} /> : null}
          </div>

          {selectedRun ? (
            <Card>
              <CardHeader><CardTitle>Run error / warning summary</CardTitle></CardHeader>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl bg-muted p-3 text-sm"><div className="text-xs text-muted-foreground">Records failed</div><div className="font-semibold">{formatNumber(selectedRun.records_failed)}</div></div>
                <div className="rounded-xl bg-muted p-3 text-sm"><div className="text-xs text-muted-foreground">Letters failed</div><div className="font-semibold">{formatNumber(selectedRun.letters_failed)}</div></div>
                <div className="rounded-xl bg-muted p-3 text-sm"><div className="text-xs text-muted-foreground">Raw path</div><div className="break-all font-mono text-xs">{selectedRun.raw_file_path || '—'}</div></div>
              </div>
              {selectedRun.error_message ? <Alert tone="danger" className="mt-4">{selectedRun.error_message}</Alert> : null}
            </Card>
          ) : null}

          <Card>
            <CardHeader><CardTitle>Raw files</CardTitle></CardHeader>
            {rawSummary.loading ? <Skeleton className="h-52" /> : rawSummary.error ? <BackendMissingState error={rawSummary.error} expectedEndpoint="GET /api/cse/import/runs/:id/raw-summary" /> : rawSummary.data ? (
              <div className="space-y-4">
                {!rawSummary.data.available ? <Alert tone="warning">{rawSummary.data.reason || 'Raw file listing is not available from the backend yet.'}</Alert> : null}
                <div className="rounded-xl bg-muted p-3 text-sm"><strong>Folder:</strong> <span className="break-all font-mono text-xs">{rawSummary.data.rawFilePath || '—'}</span></div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {(rawSummary.data.files || []).map((file) => (
                    <div key={file.path} className="rounded-xl border border-border p-3 text-sm">
                      <div className="font-semibold">{file.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{file.letter || '—'} · {file.type || file.extension || 'file'} · {formatNumber(file.sizeBytes)} bytes</div>
                    </div>
                  ))}
                </div>
                {rawSummary.data.warnings?.length ? <pre className="max-h-72 overflow-auto rounded-xl bg-muted p-3 text-xs">{rawSummary.data.warnings.join('\n')}</pre> : null}
              </div>
            ) : <Alert tone="info">Select a fetch run to view raw file information.</Alert>}
          </Card>
        </div>
      )}
    </div>
  );
}
