'use client';

import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { CompaniesTable } from '@/components/tables/CompaniesTable';
import { BackendMissingState } from '@/components/cse/BackendMissingState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCompanies } from '@/hooks/useCompanies';

export default function CompaniesPage() {
  const [search, setSearch] = useState('');
  const companies = useCompanies(search, 100);
  const countText = useMemo(() => `${companies.data?.length || 0} visible companies`, [companies.data]);
  return (
    <div>
      <PageHeader title="Companies" description="CSE listed companies saved from the official ALPHABETICAL directory import." actions={<Button variant="secondary" onClick={() => { void companies.reload(); }}>Refresh</Button>} />
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by company name" />
        <div className="rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted-foreground">{countText}</div>
      </div>
      {companies.loading ? <Skeleton className="h-96" /> : companies.error ? <BackendMissingState error={companies.error} expectedEndpoint="GET /api/cse/companies" /> : <CompaniesTable companies={companies.data || []} />}
    </div>
  );
}
