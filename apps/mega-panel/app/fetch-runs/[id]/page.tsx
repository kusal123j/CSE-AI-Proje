'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { ImportRunSummary } from '@/components/cse/ImportRunSummary';
import { AzProgressGrid } from '@/components/cse/AzProgressGrid';
import { BackendMissingState } from '@/components/cse/BackendMissingState';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getCseFetchRunDetails, getRawRunSummary } from '@/lib/api/cse';
import { useAsyncData } from '@/hooks/useAsyncData';

export default function FetchRunDetailsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const run = useAsyncData(() => getCseFetchRunDetails(id), [id]);
  const rawSummary = useAsyncData(() => getRawRunSummary(id), [id]);

  return (
    <div>
      <PageHeader
        title="Fetch Run Details"
        description="Full metadata, warnings, raw file summary, and derived A–Z status for a specific CSE import run."
        actions={<Link href="/fetch-runs"><Button variant="secondary">Back to runs</Button></Link>}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <div className="space-y-6">
          {run.loading ? <Skeleton className="h-96" /> : run.error ? <BackendMissingState error={run.error} expectedEndpoint="GET /api/cse/import/runs/:id" /> : <ImportRunSummary run={run.data} />}
          <Card>
            <CardHeader><CardTitle>Warnings and raw files</CardTitle></CardHeader>
            {rawSummary.loading ? <Skeleton className="h-40" /> : rawSummary.error ? <BackendMissingState error={rawSummary.error} expectedEndpoint="GET /api/cse/import/runs/:id/raw-summary" /> : (
              <div className="space-y-4">
                <div className="rounded-xl bg-muted p-3 text-sm"><strong>Raw path:</strong> <span className="break-all font-mono text-xs">{rawSummary.data?.rawFilePath || '—'}</span></div>
                <div className="grid gap-2 md:grid-cols-2">
                  {(rawSummary.data?.files || []).map((file) => <div key={file.path} className="rounded-xl border border-border p-3 text-xs"><div className="font-semibold">{file.name}</div><div className="mt-1 text-muted-foreground">{file.letter || '—'} · {file.type || file.extension || 'file'}</div></div>)}
                </div>
                {rawSummary.data?.warnings?.length ? <pre className="max-h-60 overflow-auto rounded-xl bg-muted p-3 text-xs">{rawSummary.data.warnings.join('\n')}</pre> : null}
              </div>
            )}
          </Card>
        </div>
        <Card>
          <CardHeader><CardTitle>A–Z progress grid</CardTitle></CardHeader>
          <AzProgressGrid run={run.data} rawSummary={rawSummary.data} />
        </Card>
      </div>
    </div>
  );
}
