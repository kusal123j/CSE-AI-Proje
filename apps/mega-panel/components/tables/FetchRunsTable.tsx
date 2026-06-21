'use client';

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import type { CseFetchRun } from '@/lib/types/cse';
import { DataTable } from './DataTable';
import { FetchRunStatusBadge } from '@/components/cse/FetchRunStatusBadge';
import { formatDateTime, formatDurationMs, formatNumber } from '@/lib/format';

const columns: ColumnDef<CseFetchRun, unknown>[] = [
  { header: 'Run ID', cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span> },
  { header: 'Status', cell: ({ row }) => <FetchRunStatusBadge status={row.original.status} /> },
  { header: 'Fetch mode', accessorKey: 'fetch_mode' },
  { header: 'Started', cell: ({ row }) => formatDateTime(row.original.started_at || undefined) },
  { header: 'Finished', cell: ({ row }) => formatDateTime(row.original.finished_at || undefined) },
  { header: 'Duration', cell: ({ row }) => formatDurationMs(row.original.started_at, row.original.finished_at) },
  { header: 'Records', cell: ({ row }) => formatNumber(row.original.records_found) },
  { header: 'Letters OK', cell: ({ row }) => formatNumber(row.original.letters_successful) },
  { header: 'Letters failed', cell: ({ row }) => formatNumber(row.original.letters_failed) },
  { header: 'Error', cell: ({ row }) => <span className="line-clamp-2 text-xs text-muted-foreground">{row.original.error_message || '—'}</span> },
  { header: 'Raw path', cell: ({ row }) => <span className="line-clamp-2 font-mono text-xs text-muted-foreground">{row.original.raw_file_path || '—'}</span> },
  { header: 'Details', cell: ({ row }) => <Link className="font-semibold text-primary" href={`/fetch-runs/${row.original.id}`}>View</Link> }
];

export function FetchRunsTable({ runs }: { runs: CseFetchRun[] }) {
  return <DataTable data={runs} columns={columns} emptyMessage="No CSE fetch runs found yet." />;
}
