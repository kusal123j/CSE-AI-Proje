'use client';

import Link from 'next/link';
import { useCseSummary } from '@/hooks/useCseSummary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function statusTone(status?: string) {
  if (status === 'Healthy') return 'success' as const;
  if (status === 'Warning') return 'warning' as const;
  if (status === 'Failed') return 'danger' as const;
  return 'muted' as const;
}

interface TopbarProps {
  onMenuClick?: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const { data, error } = useCseSummary();
  const appName = process.env.NEXT_PUBLIC_MEGA_PANEL_NAME || 'CSE Mega Control Panel';
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 px-4 py-3 backdrop-blur lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <Button className="mt-1 lg:hidden" size="sm" variant="secondary" type="button" onClick={onMenuClick} aria-label="Open navigation menu">
            ☰
          </Button>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">{appName}</div>
            <div className="text-sm text-muted-foreground">Backend-driven monitoring for CSE directory imports and analytics</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={error ? 'danger' : statusTone(data?.systemStatus)}>
            System: {error ? 'Backend issue' : data?.systemStatus || 'Checking'}
          </Badge>
          <Badge tone="info">Mode: python-http</Badge>
          <Link className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted" href="/cse-import">
            Run Import
          </Link>
        </div>
      </div>
    </header>
  );
}
