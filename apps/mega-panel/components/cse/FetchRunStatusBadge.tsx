import { Badge } from '@/components/ui/badge';

export function FetchRunStatusBadge({ status }: { status?: string | null }) {
  const normalized = (status || 'UNKNOWN').toUpperCase();
  if (normalized === 'SUCCESS') return <Badge tone="success">Success</Badge>;
  if (normalized === 'PARTIAL_SUCCESS') return <Badge tone="warning">Partial success</Badge>;
  if (normalized === 'FAILED') return <Badge tone="danger">Failed</Badge>;
  if (normalized === 'RUNNING') return <Badge tone="info">Running</Badge>;
  return <Badge tone="muted">{normalized}</Badge>;
}
