'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { BackendMissingState } from '@/components/cse/BackendMissingState';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableContainer } from '@/components/ui/table';
import { getCompanyProfileDetail } from '@/lib/api/cse';
import { useAsyncData } from '@/hooks/useAsyncData';

function text(value: unknown) {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

export default function CompanyProfileDetailPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = decodeURIComponent(params.symbol);
  const detail = useAsyncData(() => getCompanyProfileDetail(symbol), [symbol]);

  if (detail.loading) return <Skeleton className="h-96" />;
  if (detail.error) return <BackendMissingState error={detail.error} expectedEndpoint="GET /api/cse/company-profiles/:symbol" />;
  if (!detail.data) return null;

  const { profile, latestPrice, people, financialReports, announcements } = detail.data;

  return (
    <div>
      <PageHeader title={`${profile.company_name} (${profile.symbol})`} description="Company profile, latest price, financial reports, announcements, and AI document readiness. Charts are not included." />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Company profile</CardTitle>
              <CardDescription>{text(profile.business_summary)}</CardDescription>
            </div>
          </CardHeader>
          <dl className="grid gap-4 sm:grid-cols-2">
            {[
              ['ISIN', profile.isin],
              ['GICS Industry Group', profile.gics_industry_group],
              ['Founded', profile.founded_year],
              ['Quoted Date', profile.quoted_date],
              ['Financial Year End', profile.financial_year_end],
              ['Board', profile.board],
              ['Address', profile.address],
              ['Phone', profile.phone],
              ['Email', profile.email],
              ['Website', profile.website],
              ['Company Secretaries', profile.company_secretaries],
              ['Auditors', profile.auditors]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border bg-background/60 p-3">
                <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">{text(value)}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Latest price</CardTitle>
              <CardDescription>Updated by the latest-price poller.</CardDescription>
            </div>
          </CardHeader>
          <div className="space-y-3 text-sm">
            <div className="text-3xl font-bold">{text(latestPrice?.last_traded_price)}</div>
            <div>Change: {text(latestPrice?.change_amount)} / {text(latestPrice?.change_percent)}%</div>
            <div>Turnover: {text(latestPrice?.turnover)}</div>
            <div>Share volume: {text(latestPrice?.share_volume)}</div>
            <div className="text-xs text-muted-foreground">Updated: {text(latestPrice?.updated_at)}</div>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>People</CardTitle></CardHeader>
          <TableContainer>
            <Table><tbody>{people.map((person) => <tr key={person.id} className="border-b border-border"><td className="px-4 py-3 font-medium">{person.person_name}</td><td className="px-4 py-3">{text(person.designation)}</td><td className="px-4 py-3 text-xs text-muted-foreground">{text(person.role_group)}</td></tr>)}</tbody></Table>
          </TableContainer>
        </Card>
        <Card>
          <CardHeader><CardTitle>Financial reports</CardTitle></CardHeader>
          <TableContainer>
            <Table><tbody>{financialReports.slice(0, 20).map((report) => <tr key={report.id} className="border-b border-border"><td className="px-4 py-3">{report.title}</td><td className="px-4 py-3 text-xs">{text(report.report_type)}</td><td className="px-4 py-3 text-xs">{text(report.published_date)}</td></tr>)}</tbody></Table>
          </TableContainer>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>Latest announcements</CardTitle></CardHeader>
        <TableContainer>
          <Table><tbody>{announcements.slice(0, 30).map((announcement) => <tr key={announcement.id} className="border-b border-border"><td className="px-4 py-3">{announcement.announcement_title}</td><td className="px-4 py-3 text-xs">{text(announcement.announcement_category)}</td><td className="px-4 py-3 text-xs">{text(announcement.published_date)}</td></tr>)}</tbody></Table>
        </TableContainer>
      </Card>
    </div>
  );
}
