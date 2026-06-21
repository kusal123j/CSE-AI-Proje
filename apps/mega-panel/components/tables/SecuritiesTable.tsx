'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { CseSecurity } from '@/lib/types/cse';
import { DataTable } from './DataTable';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate, formatNumber, formatPercent } from '@/lib/format';

function changeTone(value: unknown) {
  const n = Number(value);
  if (n > 0) return 'success' as const;
  if (n < 0) return 'danger' as const;
  return 'muted' as const;
}

const columns: ColumnDef<CseSecurity, unknown>[] = [
  { header: 'Symbol', cell: ({ row }) => <span className="font-mono font-bold">{row.original.symbol}</span> },
  { header: 'Company', cell: ({ row }) => row.original.company_name || '—' },
  { header: 'Last price', cell: ({ row }) => formatCurrency(row.original.last_traded_price) },
  { header: 'Trade volume', cell: ({ row }) => formatNumber(row.original.trade_volume) },
  { header: 'Share volume', cell: ({ row }) => formatNumber(row.original.share_volume) },
  { header: 'Turnover', cell: ({ row }) => formatCurrency(row.original.turnover) },
  { header: 'Change Rs', cell: ({ row }) => <Badge tone={changeTone(row.original.change_amount)}>{formatCurrency(row.original.change_amount)}</Badge> },
  { header: 'Change %', cell: ({ row }) => <Badge tone={changeTone(row.original.change_percent)}>{formatPercent(row.original.change_percent)}</Badge> },
  { header: 'Snapshot', cell: ({ row }) => formatDate(row.original.latest_snapshot_date || undefined) },
  { header: 'Status', cell: ({ row }) => <Badge tone={row.original.is_active === false ? 'muted' : 'success'}>{row.original.is_active === false ? 'Inactive' : 'Active'}</Badge> }
];

export function SecuritiesTable({ securities }: { securities: CseSecurity[] }) {
  return <DataTable data={securities} columns={columns} emptyMessage="No CSE securities found. Run the A–Z import first." />;
}
