import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { CseDashboardSummary } from '@/lib/types/dashboard';
import { formatDate, formatDateTime } from '@/lib/format';

function tone(status?: string) {
  if (status === 'Healthy') return 'success' as const;
  if (status === 'Warning') return 'warning' as const;
  if (status === 'Failed') return 'danger' as const;
  return 'muted' as const;
}

export function SystemStatusCard({ summary }: { summary: CseDashboardSummary }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>System status</CardTitle>
          <CardDescription>Derived from latest market snapshot and import run history.</CardDescription>
        </div>
        <Badge tone={tone(summary.systemStatus)}>{summary.systemStatus}</Badge>
      </CardHeader>
      <div className="grid gap-3 text-sm md:grid-cols-3">
        <div className="rounded-xl bg-muted p-3">
          <div className="text-xs text-muted-foreground">Latest snapshot</div>
          <div className="mt-1 font-semibold">{formatDate(summary.latestMarketSnapshotDate || undefined)}</div>
        </div>
        <div className="rounded-xl bg-muted p-3">
          <div className="text-xs text-muted-foreground">Last success</div>
          <div className="mt-1 font-semibold">{formatDateTime(summary.lastSuccessfulImport?.finished_at || undefined)}</div>
        </div>
        <div className="rounded-xl bg-muted p-3">
          <div className="text-xs text-muted-foreground">Last failed</div>
          <div className="mt-1 font-semibold">{formatDateTime(summary.lastFailedImport?.finished_at || undefined)}</div>
        </div>
      </div>
    </Card>
  );
}
