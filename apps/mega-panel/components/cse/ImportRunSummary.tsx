import type { CseFetchRun } from '@/lib/types/cse';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { FetchRunStatusBadge } from './FetchRunStatusBadge';
import { formatDateTime, formatDurationMs, formatNumber } from '@/lib/format';

export function ImportRunSummary({ run }: { run?: CseFetchRun | null }) {
  if (!run) {
    return <Card><div className="text-sm text-muted-foreground">No fetch run is available yet.</div></Card>;
  }
  const rows = [
    ['Run ID', run.id],
    ['Fetch mode', run.fetch_mode || 'python-http'],
    ['Started at', formatDateTime(run.started_at || undefined)],
    ['Finished at', formatDateTime(run.finished_at || undefined)],
    ['Duration', formatDurationMs(run.started_at, run.finished_at)],
    ['Records found', formatNumber(run.records_found)],
    ['Records before deduplication', formatNumber(run.records_before_deduplication)],
    ['Records deduplicated', formatNumber(run.records_deduplicated)],
    ['Companies upserted', formatNumber(Number(run.companies_created || 0) + Number(run.companies_updated || 0))],
    ['Securities upserted', formatNumber(Number(run.securities_created || 0) + Number(run.securities_updated || 0))],
    ['Snapshots upserted', formatNumber(Number(run.snapshots_created || 0) + Number(run.snapshots_updated || 0))],
    ['Raw storage path', run.raw_file_path || '—'],
    ['Error message', run.error_message || '—']
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Latest import run</CardTitle>
        <FetchRunStatusBadge status={run.status} />
      </CardHeader>
      <div className="grid gap-2 md:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-muted p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 break-words text-sm font-semibold text-foreground">{value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
