'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { CseMarketRankingItem } from '@/lib/types/cse';
import { DataTable } from './DataTable';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';

function tone(value: unknown) {
  const n = Number(value);
  if (n > 0) return 'success' as const;
  if (n < 0) return 'danger' as const;
  return 'muted' as const;
}

const columns: ColumnDef<CseMarketRankingItem, unknown>[] = [
  { header: 'Symbol', cell: ({ row }) => <span className="font-mono font-bold">{row.original.symbol}</span> },
  { header: 'Company', cell: ({ row }) => row.original.company_name || '—' },
  { header: 'Last trade', cell: ({ row }) => formatCurrency(row.original.last_traded_price) },
  { header: 'Change Rs', cell: ({ row }) => <Badge tone={tone(row.original.change_amount)}>{formatCurrency(row.original.change_amount)}</Badge> },
  { header: 'Change %', cell: ({ row }) => <Badge tone={tone(row.original.change_percent)}>{formatPercent(row.original.change_percent)}</Badge> },
  { header: 'Share volume', cell: ({ row }) => formatNumber(row.original.share_volume) },
  { header: 'Trade volume', cell: ({ row }) => formatNumber(row.original.trade_volume) },
  { header: 'Watch List', cell: ({ row }) => row.original.is_watch_list ? <Badge tone="warning">Watch List</Badge> : '—' }
];

export function AnalyticsRankingTable({ rows }: { rows: CseMarketRankingItem[] }) {
  return <DataTable data={rows} columns={columns} emptyMessage="No ranking data available for this date." />;
}
