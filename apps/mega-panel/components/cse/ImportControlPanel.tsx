'use client';

import { useState } from 'react';
import { runCseImport, runDailyMarketSummaryImport, runGicsImport, runTradeSummaryImport } from '@/lib/api/cse';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { CseDailyMarketSummary, CseImportConfig } from '@/lib/types/cse';
import { getErrorMessage } from '@/lib/api/errors';
import { useDailyMarketSummary } from '@/hooks/useDailyMarketSummary';

function ResultAlert({ result }: { result: unknown }) {
  return (
    <Alert tone="success" className="mt-4">
      <div className="font-semibold">Import job started. The latest run status will refresh shortly; use the Refresh button for final completion details.</div>
      <pre className="mt-2 max-h-52 overflow-auto rounded-xl bg-background p-3 text-xs">{JSON.stringify(result, null, 2)}</pre>
    </Alert>
  );
}

function Stat({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold">{value ?? 'Unknown'}</div>
    </div>
  );
}

function valueFromSummary(summary: CseDailyMarketSummary | null | undefined, snakeKey: keyof CseDailyMarketSummary, camelKey?: keyof CseDailyMarketSummary) {
  if (!summary) return null;
  return summary[snakeKey] ?? (camelKey ? summary[camelKey] : null) ?? null;
}

function formatNumber(value: unknown, options?: Intl.NumberFormatOptions) {
  if (value === null || value === undefined || value === '') return 'Not imported';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return new Intl.NumberFormat('en-LK', options).format(number);
}

function formatRs(value: unknown) {
  const formatted = formatNumber(value, { maximumFractionDigits: 0 });
  return formatted === 'Not imported' ? formatted : `Rs. ${formatted}`;
}

function warningsFromSummary(summary: CseDailyMarketSummary | null | undefined): string[] {
  const warnings = summary?.warnings ?? summary?.warnings_json;
  if (Array.isArray(warnings)) return warnings.map(String);
  if (typeof warnings === 'string') {
    try {
      const parsed = JSON.parse(warnings);
      return Array.isArray(parsed) ? parsed.map(String) : [warnings];
    } catch {
      return warnings ? [warnings] : [];
    }
  }
  return [];
}

function validationStatus(summary: CseDailyMarketSummary | null | undefined) {
  const report = summary?.validationReport ?? summary?.validation_report;
  if (!report) return 'Unknown';
  return report.valid === true ? 'Valid' : 'Invalid';
}

function checksumShort(summary: CseDailyMarketSummary | null | undefined) {
  const checksum = summary?.checksum;
  return checksum ? `${checksum.slice(0, 10)}…` : 'Not saved';
}

function formatPercent(value: unknown) {
  const formatted = formatNumber(value, { maximumFractionDigits: 2 });
  return formatted === 'Not imported' ? formatted : `${formatted}%`;
}

export function ImportControlPanel({ config, onRunFinished }: { config?: CseImportConfig | null; onRunFinished?: () => void }) {
  const [runningAlphabetical, setRunningAlphabetical] = useState(false);
  const [runningTradeSummary, setRunningTradeSummary] = useState(false);
  const [runningGics, setRunningGics] = useState(false);
  const [runningDailyMarketSummary, setRunningDailyMarketSummary] = useState(false);
  const dailyMarketSummary = useDailyMarketSummary();
  const [result, setResult] = useState<unknown | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAlphabeticalRun() {
    setRunningAlphabetical(true);
    setError(null);
    setResult(null);
    try {
      const response = await runCseImport();
      setResult(response);
      onRunFinished?.();
      window.setTimeout(() => onRunFinished?.(), 1500);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRunningAlphabetical(false);
    }
  }

  async function handleTradeSummaryRun() {
    setRunningTradeSummary(true);
    setError(null);
    setResult(null);
    try {
      const response = await runTradeSummaryImport();
      setResult(response);
      onRunFinished?.();
      window.setTimeout(() => onRunFinished?.(), 1500);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRunningTradeSummary(false);
    }
  }


  async function handleDailyMarketSummaryRun() {
    setRunningDailyMarketSummary(true);
    setError(null);
    setResult(null);
    try {
      const response = await runDailyMarketSummaryImport();
      setResult(response);
      await dailyMarketSummary.reload();
      onRunFinished?.();
      window.setTimeout(() => {
        void dailyMarketSummary.reload();
        onRunFinished?.();
      }, 1500);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRunningDailyMarketSummary(false);
    }
  }

  async function handleGicsRun() {
    setRunningGics(true);
    setError(null);
    setResult(null);
    try {
      const response = await runGicsImport();
      setResult(response);
      onRunFinished?.();
      window.setTimeout(() => onRunFinished?.(), 1500);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRunningGics(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <CardTitle>A–Z company/security master import</CardTitle>
              <Badge tone="info">Master data</Badge>
            </div>
            <CardDescription>Triggers the existing CSE Listed Company Directory ALPHABETICAL A–Z Python HTTP importer.</CardDescription>
          </div>
          <Button onClick={handleAlphabeticalRun} disabled={runningAlphabetical || runningTradeSummary || runningGics || runningDailyMarketSummary}>{runningAlphabetical ? 'Starting…' : 'Start A–Z Import'}</Button>
        </CardHeader>
        <div className="grid gap-3 md:grid-cols-4">
          <Stat label="Import mode" value={config?.mode || 'python-http'} />
          <Stat label="Scheduler" value={config ? (config.schedulerEnabled ? 'Enabled' : 'Disabled') : 'Unknown'} />
          <Stat label="Job / letter timeout" value={`${config?.jobTimeoutSeconds || 300}s / ${config?.letterTimeoutSeconds || 30}s`} />
          <Stat label="Retries / automation" value={`${config?.maxRetries || 3} retries / HTTP API`} />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <CardTitle>Trade Summary daily market import</CardTitle>
              <Badge tone="success">Daily statistics</Badge>
            </div>
            <CardDescription>Starts the daily share trading statistics import: previous close, open, high, low, last trade, volumes, change %, and Watch List flags. The backend runs the job asynchronously and this panel refreshes the latest status after trigger.</CardDescription>
          </div>
          <Button onClick={handleTradeSummaryRun} disabled={runningAlphabetical || runningTradeSummary || runningGics || runningDailyMarketSummary || config?.tradeSummary?.enabled === false}>
            {runningTradeSummary ? 'Starting…' : 'Start Trade Summary Import'}
          </Button>
        </CardHeader>
        <div className="grid gap-3 md:grid-cols-4">
          <Stat label="Source" value={config?.tradeSummary?.source || 'CSE_TRADE_SUMMARY'} />
          <Stat label="Scheduler" value={config?.tradeSummary ? (config.tradeSummary.schedulerEnabled ? 'Enabled' : 'Disabled') : 'Unknown'} />
          <Stat label="Timeout" value={`${config?.tradeSummary?.timeoutSeconds || 90}s`} />
          <Stat label="CSV fallback" value={config?.tradeSummary?.csvFallbackConfigured ? 'Configured' : config?.tradeSummary?.csvDiscoveryEnabled ? 'Auto-discovery enabled' : 'Not configured'} />
        </div>
        <Alert tone="warning" className="mt-4">
          Trade Summary is saved as daily market activity. It does not replace the A–Z company/security master importer. No Playwright/Chromium browser automation is used.
        </Alert>
      </Card>




      <Card>
        <CardHeader>
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <CardTitle>Daily Market Summary import</CardTitle>
              <Badge tone="info">Market overview</Badge>
              {warningsFromSummary(dailyMarketSummary.data).length ? <Badge tone="warning">{warningsFromSummary(dailyMarketSummary.data).length} warnings</Badge> : <Badge tone="success">Validated</Badge>}
            </div>
            <CardDescription>Imports the market-level Daily Market Summary: ASPI, S&P SL20, turnover, foreign/domestic flows, PER, PBV, DY, market capitalization, debt, and CDS holdings. This is stored separately from company/security snapshots.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void dailyMarketSummary.reload()} disabled={dailyMarketSummary.loading}>Refresh summary</Button>
            <Button onClick={handleDailyMarketSummaryRun} disabled={runningAlphabetical || runningTradeSummary || runningGics || runningDailyMarketSummary || config?.dailyMarketSummary?.enabled === false}>
              {runningDailyMarketSummary ? 'Starting…' : 'Start Daily Market Summary Import'}
            </Button>
          </div>
        </CardHeader>
        <div className="grid gap-3 md:grid-cols-4">
          <Stat label="Latest trading date" value={valueFromSummary(dailyMarketSummary.data, 'trading_date', 'tradingDate') as string | null} />
          <Stat label="Source AS OF" value={valueFromSummary(dailyMarketSummary.data, 'source_as_of_text', 'sourceAsOfText') as string | null} />
          <Stat label="Fetch mode" value={(valueFromSummary(dailyMarketSummary.data, 'fetch_mode', 'fetchMode') as string | null) || config?.dailyMarketSummary?.fetchMode || 'python-http'} />
          <Stat label="Fetch strategy" value={(valueFromSummary(dailyMarketSummary.data, 'fetch_strategy', 'fetchStrategy') as string | null) || config?.dailyMarketSummary?.fetchStrategy || 'api-first-html-fallback'} />
          <Stat label="ASPI / change" value={`${formatNumber(valueFromSummary(dailyMarketSummary.data, 'aspi_today'), { maximumFractionDigits: 2 })} / ${formatPercent(dailyMarketSummary.data?.calculated?.aspiChangePercent)}`} />
          <Stat label="S&P SL20 / change" value={`${formatNumber(valueFromSummary(dailyMarketSummary.data, 'sp_sl20_today'), { maximumFractionDigits: 2 })} / ${formatPercent(dailyMarketSummary.data?.calculated?.spSl20ChangePercent)}`} />
          <Stat label="Equity turnover / change" value={`${formatRs(valueFromSummary(dailyMarketSummary.data, 'equity_turnover_today'))} / ${formatPercent(dailyMarketSummary.data?.calculated?.turnoverChangePercent)}`} />
          <Stat label="Foreign net flow" value={formatRs(dailyMarketSummary.data?.calculated?.foreignNetFlow)} />
          <Stat label="Market cap" value={formatRs(valueFromSummary(dailyMarketSummary.data, 'market_cap_today'))} />
          <Stat label="PER / PBV / DY" value={`${formatNumber(valueFromSummary(dailyMarketSummary.data, 'market_per_today'), { maximumFractionDigits: 2 })} / ${formatNumber(valueFromSummary(dailyMarketSummary.data, 'market_pbv_today'), { maximumFractionDigits: 2 })} / ${formatNumber(valueFromSummary(dailyMarketSummary.data, 'market_dy_today'), { maximumFractionDigits: 2 })}`} />
          <Stat label="Traded participation" value={formatPercent(dailyMarketSummary.data?.calculated?.tradedCompanyParticipationPercent)} />
          <Stat label="Validation / checksum" value={`${validationStatus(dailyMarketSummary.data)} / ${checksumShort(dailyMarketSummary.data)}`} />
        </div>
        {!dailyMarketSummary.loading && !dailyMarketSummary.data && !dailyMarketSummary.error ? (
          <Alert tone="warning" className="mt-4">No Daily Market Summary has been imported yet. Use the manual run button after backend and Python worker are running.</Alert>
        ) : null}
        {warningsFromSummary(dailyMarketSummary.data).length ? (
          <Alert tone="warning" className="mt-4">
            <strong>Daily Market Summary warnings:</strong>
            <ul className="mt-2 list-disc pl-5">
              {warningsFromSummary(dailyMarketSummary.data).slice(0, 6).map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
            </ul>
          </Alert>
        ) : null}
        {dailyMarketSummary.error ? (
          <Alert tone="danger" className="mt-4">Daily Market Summary endpoint is not available yet: {getErrorMessage(dailyMarketSummary.error)}</Alert>
        ) : null}
        <Alert tone="warning" className="mt-4">
          Daily Market Summary is a market-level aggregate table. It does not replace Trade Summary company/security rows and does not use Playwright/Chromium. Partial API responses are completed with the HTML table fallback before saving.
        </Alert>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <CardTitle>GICS industry intelligence import</CardTitle>
              <Badge tone="warning">Industry groups</Badge>
            </div>
            <CardDescription>Imports official CSE GICS Summary, Industry Group Indices, and Classification data as a separate enrichment module. This does not replace A–Z or Trade Summary data.</CardDescription>
          </div>
          <Button onClick={handleGicsRun} disabled={runningAlphabetical || runningTradeSummary || runningGics || runningDailyMarketSummary || config?.gics?.enabled === false}>
            {runningGics ? 'Starting…' : 'Start GICS Import'}
          </Button>
        </CardHeader>
        <div className="grid gap-3 md:grid-cols-4">
          <Stat label="Source" value={config?.gics?.source || 'CSE_GICS'} />
          <Stat label="Expected groups" value={config?.gics?.minExpectedGroups || 20} />
          <Stat label="Min classifications" value={config?.gics?.minExpectedClassificationRows || 250} />
          <Stat label="Automation" value={config?.gics?.browserAutomationEnabled ? 'Browser enabled' : 'HTTP/API only'} />
        </div>
        <Alert tone="warning" className="mt-4">
          GICS uses lightweight HTTP/API/download/HTML parsing only. Unmapped symbols are reported as warnings and are not blindly created as securities.
        </Alert>
      </Card>

      {error ? <Alert tone="danger"><strong>Import trigger failed:</strong> {error}</Alert> : null}
      {result ? <ResultAlert result={result} /> : null}
      <Alert tone="warning">
        The import secret is never stored in browser code. Buttons call Next.js server routes, and those server routes forward the secure header to the backend.
      </Alert>
    </div>
  );
}
