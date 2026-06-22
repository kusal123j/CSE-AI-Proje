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
import { getAllCompanyFinancialReports, retryFinancialReportDocument, runCompanyFinancialsImport } from '@/lib/api/cse';
import { useAsyncData } from '@/hooks/useAsyncData';

function text(value: unknown) {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

export default function CompanyFinancialReportsPage() {
  const [symbol, setSymbol] = useState('');
  const [reportType, setReportType] = useState('');
  const [financialYear, setFinancialYear] = useState('');
  const [runningMode, setRunningMode] = useState<'one' | 'all' | null>(null);
  const [message, setMessage] = useState('');
  const reports = useAsyncData(() => getAllCompanyFinancialReports({ symbol, reportType, financialYear, limit: 500 }), [symbol, reportType, financialYear]);


  async function retryDocument(reportId: string) {
    setMessage('');
    try {
      const result = await retryFinancialReportDocument(reportId);
      setMessage(`Financial report PDF retry queued: ${JSON.stringify(result)}`);
      await reports.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to retry financial report PDF');
    }
  }

  async function runImport(mode: 'one' | 'all') {
    if (mode === 'one' && !symbol.trim()) {
      setMessage('Enter a symbol before running a one-symbol report import.');
      return;
    }
    if (mode === 'all' && !window.confirm('This will discover financial reports for all active CSE securities. Continue?')) return;
    setRunningMode(mode);
    setMessage('');
    try {
      const result = await runCompanyFinancialsImport(mode === 'one' ? { symbol: symbol.trim().toUpperCase() } : undefined);
      setMessage(`Financial reports import started: ${JSON.stringify(result)}`);
      await reports.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start financial reports import');
    } finally {
      setRunningMode(null);
    }
  }

  return (
    <div>
      <PageHeader title="Financial Reports" description="Monitor wanted Financials only: annual reports, quarterly/interim reports, and other reports. Charts are skipped." />
      <Card className="mb-6">
        <CardHeader>
          <div><CardTitle>Report discovery controls</CardTitle><CardDescription>Use one-symbol import for testing, or Run all companies for the production discovery pass.</CardDescription></div>
        </CardHeader>
        <div className="grid gap-4 md:grid-cols-3">
          <Input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder="Symbol filter / AFSL.N0000" />
          <Input value={reportType} onChange={(event) => setReportType(event.target.value.toUpperCase())} placeholder="Report type e.g. ANNUAL_REPORT" />
          <Input value={financialYear} onChange={(event) => setFinancialYear(event.target.value)} placeholder="Financial year e.g. 2025" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => runImport('one')} disabled={Boolean(runningMode)}>{runningMode === 'one' ? 'Starting…' : 'Run one symbol'}</Button>
          <Button onClick={() => runImport('all')} disabled={Boolean(runningMode)}>{runningMode === 'all' ? 'Starting…' : 'Run all companies'}</Button>
        </div>
        {message ? <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-muted p-4 text-xs text-muted-foreground">{message}</pre> : null}
      </Card>

      {reports.loading ? <Skeleton className="h-96" /> : reports.error ? <BackendMissingState error={reports.error} expectedEndpoint="GET /api/cse/company-financial-reports" /> : (
        <TableContainer>
          <Table>
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Symbol</th><th className="px-4 py-3">Company</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Title</th><th className="px-4 py-3">Year/Period</th><th className="px-4 py-3">Published</th><th className="px-4 py-3">Document</th><th className="px-4 py-3">PDF</th><th className="px-4 py-3">Actions</th></tr></thead>
            <tbody className="divide-y divide-border">{(reports.data ?? []).map((report) => <tr key={report.id}><td className="px-4 py-3 font-semibold text-primary"><Link href={`/company-profiles/${encodeURIComponent(report.symbol)}`}>{report.symbol}</Link></td><td className="px-4 py-3">{text(report.company_name)}</td><td className="px-4 py-3">{text(report.report_type)}</td><td className="px-4 py-3 max-w-xl">{text(report.title)}</td><td className="px-4 py-3">{text(report.financial_year)} / {text(report.period)}</td><td className="px-4 py-3">{text(report.published_date)}</td><td className="px-4 py-3">{report.document_id ? text(report.document_status ?? 'DISCOVERED') : 'Missing PDF'}</td><td className="px-4 py-3">{report.pdf_url ? <a className="text-primary underline" href={report.pdf_url} target="_blank" rel="noreferrer">Open</a> : '—'}</td><td className="px-4 py-3"><Button variant="secondary" onClick={() => retryDocument(report.id)} disabled={!report.pdf_url}>Retry PDF</Button></td></tr>)}</tbody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
}
