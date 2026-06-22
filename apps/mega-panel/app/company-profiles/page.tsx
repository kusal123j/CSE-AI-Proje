'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { BackendMissingState } from '@/components/cse/BackendMissingState';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableContainer } from '@/components/ui/table';
import { getCompanyProfiles, runCompanyProfilesImport } from '@/lib/api/cse';
import { useAsyncData } from '@/hooks/useAsyncData';

function valueText(value: unknown) {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

export default function CompanyProfilesPage() {
  const [search, setSearch] = useState('');
  const [runningMode, setRunningMode] = useState<'all' | 'batch' | null>(null);
  const profiles = useAsyncData(() => getCompanyProfiles({ search, limit: 300 }), [search]);

  async function runImport(mode: 'all' | 'batch') {
    if (mode === 'all' && !window.confirm('This will import company profiles for all active CSE securities. Continue?')) return;
    setRunningMode(mode);
    try {
      await runCompanyProfilesImport(mode === 'batch' ? { limit: 25 } : undefined);
      await profiles.reload();
    } finally {
      setRunningMode(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Company Intelligence"
        description="CSE company profile enrichment. Charts are intentionally skipped; profile, reports, announcements, and latest price are used."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => runImport('batch')} disabled={Boolean(runningMode)}>{runningMode === 'batch' ? 'Starting…' : 'Run test batch 25'}</Button>
            <Button onClick={() => runImport('all')} disabled={Boolean(runningMode)}>{runningMode === 'all' ? 'Starting…' : 'Run all companies'}</Button>
          </div>
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Search company profiles</CardTitle>
            <CardDescription>Run A–Z import first, then enrich all active CSE symbols. Test batch is limited to 25; Run all companies has no silent limit.</CardDescription>
          </div>
        </CardHeader>
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search symbol or company name" />
      </Card>

      {profiles.loading ? <Skeleton className="h-96" /> : profiles.error ? <BackendMissingState error={profiles.error} expectedEndpoint="GET /api/cse/company-profiles" /> : (
        <TableContainer>
          <Table>
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Symbol</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">GICS</th>
                <th className="px-4 py-3">Latest price</th>
                <th className="px-4 py-3">Reports</th>
                <th className="px-4 py-3">Announcements</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(profiles.data ?? []).map((profile) => (
                <tr key={profile.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3 font-semibold text-primary"><Link href={`/company-profiles/${encodeURIComponent(profile.symbol)}`}>{profile.symbol}</Link></td>
                  <td className="px-4 py-3">{profile.company_name}</td>
                  <td className="px-4 py-3">{valueText(profile.gics_industry_group)}</td>
                  <td className="px-4 py-3">{valueText(profile.last_traded_price)}</td>
                  <td className="px-4 py-3">{valueText(profile.report_count)}</td>
                  <td className="px-4 py-3">{valueText(profile.announcement_count)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{valueText(profile.last_profile_fetched_at)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
}
