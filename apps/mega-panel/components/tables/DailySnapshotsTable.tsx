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

export function DailySnapshotsTable({ snapshots }: { snapshots: CseDailySnapshot[] }) {
  const [raw, setRaw] = useState<CseDailySnapshot | null>(null);
  const columns: ColumnDef<CseDailySnapshot, unknown>[] = [
    { header: 'Date', cell: ({ row }) => formatDate(row.original.trading_date || undefined) },
    { header: 'Symbol', cell: ({ row }) => <span className="font-mono font-bold">{row.original.symbol}</span> },
    { header: 'Company', cell: ({ row }) => row.original.company_name || '—' },
    { header: 'Last price', cell: ({ row }) => formatCurrency(row.original.last_traded_price) },
    { header: 'Trade volume', cell: ({ row }) => formatNumber(row.original.trade_volume) },
    { header: 'Share volume', cell: ({ row }) => formatNumber(row.original.share_volume) },
    { header: 'Turnover', cell: ({ row }) => formatCurrency(row.original.turnover) },
    { header: 'Change Rs', cell: ({ row }) => <Badge tone={changeTone(row.original.change_amount)}>{formatCurrency(row.original.change_amount)}</Badge> },
    { header: 'Change %', cell: ({ row }) => <Badge tone={changeTone(row.original.change_percent)}>{formatPercent(row.original.change_percent)}</Badge> },
    { header: 'Source letter', cell: ({ row }) => row.original.source_letter || '—' },
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
