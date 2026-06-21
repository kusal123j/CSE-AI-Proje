'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { CseMarketRankingItem } from '@/lib/types/cse';
import { DataTable } from './DataTable';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';

const columns: ColumnDef<CseMarketRankingItem, unknown>[] = [
  { header: 'Symbol', cell: ({ row }) => <span className="font-mono font-bold">{row.original.symbol}</span> },
  { header: 'Company', cell: ({ row }) => row.original.company_name || '—' },
  { header: 'Last price', cell: ({ row }) => formatCurrency(row.original.last_traded_price) },
  { header: 'Change Rs', cell: ({ row }) => <Badge tone={Number(row.original.change_amount) >= 0 ? 'success' : 'danger'}>{formatCurrency(row.original.change_amount)}</Badge> },
  { header: 'Change %', cell: ({ row }) => <Badge tone={Number(row.original.change_percent) >= 0 ? 'success' : 'danger'}>{formatPercent(row.original.change_percent)}</Badge> },
  { header: 'Turnover', cell: ({ row }) => formatCurrency(row.original.turnover) },
  { header: 'Trade volume', cell: ({ row }) => formatNumber(row.original.trade_volume) },
  { header: 'Share volume', cell: ({ row }) => formatNumber(row.original.share_volume) }
];

export function AnalyticsRankingTable({ rows }: { rows: CseMarketRankingItem[] }) {
  return <DataTable data={rows} columns={columns} emptyMessage="No ranking data available for this date." />;
}
