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
import { getAllCompanyAnnouncements, retryAnnouncementDocument, runCompanyAnnouncementsImport } from '@/lib/api/cse';
import { useAsyncData } from '@/hooks/useAsyncData';

function text(value: unknown) {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

function yesNo(value: unknown) {
  if (value === true || value === 'true') return 'Yes';
  if (value === false || value === 'false') return 'No';
  return text(value);
}

function PdfLink({ href, label }: { href?: string | null; label: string }) {
  return href ? (
    <a
      className="inline-flex rounded-full border px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"
      href={href}
      target="_blank"
      rel="noreferrer"
      title={href}
    >
      {label}
    </a>
  ) : <>—</>;
}

function ShortText({ value, className = '' }: { value?: unknown; className?: string }) {
  const rendered = text(value);
  return <span className={`block max-w-xs truncate ${className}`} title={rendered}>{rendered}</span>;
}

export default function CompanyAnnouncementsPage() {
  const [symbol, setSymbol] = useState('');
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [runningMode, setRunningMode] = useState<'one' | 'all' | null>(null);
  const announcements = useAsyncData(() => getAllCompanyAnnouncements({ symbol, startDate, endDate, category, limit: 500 }), [symbol, startDate, endDate, category]);


  async function retryDocument(announcementId: string) {
    setMessage('');
    try {
      const result = await retryAnnouncementDocument(announcementId);
      setMessage(`Announcement PDF retry queued: ${JSON.stringify(result)}`);
      await announcements.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to retry announcement PDF');
    }
  }

  async function runImport(mode: 'one' | 'all') {
    if (mode === 'one' && !symbol.trim()) {
      setMessage('Enter a symbol before running a one-company announcement import.');
      return;
    }
    if (mode === 'all' && !window.confirm('This will discover announcements for all active CSE securities in the selected date range. Continue?')) return;
    setRunningMode(mode);
    setMessage('');
    try {
      const result = await runCompanyAnnouncementsImport(mode === 'one' ? { symbol: symbol.trim().toUpperCase(), startDate, endDate } : { startDate, endDate });
      setMessage(`Announcement import started: ${JSON.stringify(result)}`);
      await announcements.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start announcement import');
    } finally {
      setRunningMode(null);
    }
  }

  return (
    <div>
      <PageHeader title="Company Announcements" description="Run symbol + start date + end date announcement discovery. Announcement PDFs are source-guarded and linked into the document pipeline." />
      <Card className="mb-6">
        <CardHeader>
          <div><CardTitle>Date-range import and monitoring</CardTitle><CardDescription>Leave symbol blank to view/import all companies for the selected period.</CardDescription></div>
        </CardHeader>
        <div className="grid gap-4 md:grid-cols-4">
          <Input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder="Symbol filter / AFSL.N0000" />
          <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          <Input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Category filter" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => runImport('one')} disabled={Boolean(runningMode)}>{runningMode === 'one' ? 'Starting…' : 'Run one symbol'}</Button><Button onClick={() => runImport('all')} disabled={Boolean(runningMode)}>{runningMode === 'all' ? 'Starting…' : 'Run all companies'}</Button></div>
        {message ? <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-muted p-4 text-xs text-muted-foreground">{message}</pre> : null}
      </Card>

      {announcements.loading ? <Skeleton className="h-96" /> : announcements.error ? <BackendMissingState error={announcements.error} expectedEndpoint="GET /api/cse/company-announcements" /> : (
        <TableContainer>
          <Table>
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Symbol</th><th className="px-4 py-3">Company</th><th className="px-4 py-3">Title</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Published</th><th className="px-4 py-3">Auto</th><th className="px-4 py-3">Document</th><th className="px-4 py-3">URLs</th><th className="px-4 py-3">Error</th><th className="px-4 py-3">Actions</th></tr></thead>
            <tbody className="divide-y divide-border">{(announcements.data ?? []).map((item) => <tr key={item.id}><td className="px-4 py-3 font-semibold text-primary"><Link href={`/company-profiles/${encodeURIComponent(item.symbol)}`}>{item.symbol}</Link></td><td className="px-4 py-3">{text(item.company_name)}</td><td className="px-4 py-3 max-w-xl">{text(item.announcement_title)}</td><td className="px-4 py-3">{text(item.announcement_category)}</td><td className="px-4 py-3">{text(item.published_date ?? item.published_at)}</td><td className="px-4 py-3"><div className="font-medium">{yesNo(item.auto_download_eligible)}</div><ShortText value={item.auto_download_reason} className="text-xs text-muted-foreground" /></td><td className="px-4 py-3">{item.document_id ? text(item.document_status ?? 'DISCOVERED') : 'Metadata only'}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-1"><PdfLink href={item.original_pdf_url} label="Original" /><PdfLink href={item.pdf_url} label="CDN PDF" /></div></td><td className="px-4 py-3 text-xs text-destructive"><ShortText value={item.document_error} /></td><td className="px-4 py-3"><Button variant="secondary" onClick={() => retryDocument(item.id)} disabled={!item.pdf_url && !item.original_pdf_url}>Retry PDF</Button></td></tr>)}</tbody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
}
