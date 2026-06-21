'use client';

import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { CseDailySnapshot } from '@/lib/types/cse';
import { DataTable } from './DataTable';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate, formatNumber, formatPercent } from '@/lib/format';

function changeTone(value: unknown) {
  const n = Number(value);
  if (n > 0) return 'success' as const;
  if (n < 0) return 'danger' as const;
  return 'muted' as const;
}

function isWatchList(value: unknown) {
  return value === true || String(value).toLowerCase() === 'true';
}

export function DailySnapshotsTable({ snapshots }: { snapshots: CseDailySnapshot[] }) {
  const [raw, setRaw] = useState<CseDailySnapshot | null>(null);
  const columns: ColumnDef<CseDailySnapshot, unknown>[] = [
    { header: 'Date', cell: ({ row }) => formatDate(row.original.trading_date || undefined) },
    { header: 'Symbol', cell: ({ row }) => <span className="font-mono font-bold">{row.original.symbol}</span> },
    { header: 'Company', cell: ({ row }) => row.original.company_name || '—' },
    { header: 'Previous close', cell: ({ row }) => formatCurrency(row.original.previous_close) },
    { header: 'Open', cell: ({ row }) => formatCurrency(row.original.open_price) },
    { header: 'High', cell: ({ row }) => formatCurrency(row.original.high_price) },
    { header: 'Low', cell: ({ row }) => formatCurrency(row.original.low_price) },
    { header: 'Last trade', cell: ({ row }) => formatCurrency(row.original.last_traded_price) },
    { header: 'Change Rs', cell: ({ row }) => <Badge tone={changeTone(row.original.change_amount)}>{formatCurrency(row.original.change_amount)}</Badge> },
    { header: 'Change %', cell: ({ row }) => <Badge tone={changeTone(row.original.change_percent)}>{formatPercent(row.original.change_percent)}</Badge> },
    { header: 'Share volume', cell: ({ row }) => formatNumber(row.original.share_volume) },
    { header: 'Trade volume', cell: ({ row }) => formatNumber(row.original.trade_volume) },
    { header: 'Watch List', cell: ({ row }) => isWatchList(row.original.is_watch_list) ? <Badge tone="warning">Watch List</Badge> : '—' },
    { header: 'Source', cell: ({ row }) => <Badge tone={row.original.source_page === 'TRADE_SUMMARY' ? 'success' : 'info'}>{row.original.source_page || row.original.source_letter || '—'}</Badge> },
    { header: 'Market timestamp', cell: ({ row }) => row.original.source_market_timestamp_text || formatDate(row.original.market_timestamp || undefined) },
    { header: 'Raw row', cell: ({ row }) => <Button size="sm" variant="secondary" onClick={() => setRaw(row.original)}>View</Button> }
  ];
  return (
    <>
      <DataTable data={snapshots} columns={columns} emptyMessage="No daily market snapshots found for the selected filter." />
      <Dialog open={Boolean(raw)} title={`Raw row: ${raw?.symbol || ''}`} onClose={() => setRaw(null)}>
        <pre className="overflow-auto rounded-xl bg-muted p-4 text-xs">{JSON.stringify(raw?.raw_row ?? raw, null, 2)}</pre>
      </Dialog>
    </>
  );
}
