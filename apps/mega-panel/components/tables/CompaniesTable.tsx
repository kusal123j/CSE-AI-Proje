'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { CseCompany } from '@/lib/types/cse';
import { DataTable } from './DataTable';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatNumber } from '@/lib/format';

const columns: ColumnDef<CseCompany, unknown>[] = [
  {
    header: 'Company',
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        {row.original.logo_url ? <img src={row.original.logo_url} alt="" className="h-9 w-9 rounded-lg object-contain" /> : <div className="h-9 w-9 rounded-lg bg-muted" />}
        <div>
          <div className="font-semibold">{row.original.name}</div>
          {row.original.profile_url ? <a href={row.original.profile_url} target="_blank" rel="noreferrer" className="text-xs text-primary">Profile URL</a> : <div className="text-xs text-muted-foreground">No profile URL</div>}
        </div>
      </div>
    )
  },
  { header: 'Symbols', cell: ({ row }) => row.original.security_count === undefined ? 'Unavailable' : formatNumber(row.original.security_count) },
  { header: 'First seen', cell: ({ row }) => formatDate(row.original.first_seen_at || undefined) },
  { header: 'Last seen', cell: ({ row }) => formatDate(row.original.last_seen_at || undefined) },
  { header: 'Status', cell: ({ row }) => <Badge tone={row.original.is_active === false ? 'muted' : 'success'}>{row.original.is_active === false ? 'Inactive' : 'Active'}</Badge> }
];

export function CompaniesTable({ companies }: { companies: CseCompany[] }) {
  return <DataTable data={companies} columns={columns} emptyMessage="No CSE companies found. Run the A–Z import first." />;
}
