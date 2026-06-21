'use client';

import { useState } from 'react';
import { runCseImport, runGicsImport, runTradeSummaryImport } from '@/lib/api/cse';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { CseImportConfig } from '@/lib/types/cse';
import { getErrorMessage } from '@/lib/api/errors';

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

export function ImportControlPanel({ config, onRunFinished }: { config?: CseImportConfig | null; onRunFinished?: () => void }) {
  const [runningAlphabetical, setRunningAlphabetical] = useState(false);
  const [runningTradeSummary, setRunningTradeSummary] = useState(false);
  const [runningGics, setRunningGics] = useState(false);
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
          <Button onClick={handleAlphabeticalRun} disabled={runningAlphabetical || runningTradeSummary || runningGics}>{runningAlphabetical ? 'Starting…' : 'Start A–Z Import'}</Button>
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
          <Button onClick={handleTradeSummaryRun} disabled={runningAlphabetical || runningTradeSummary || runningGics || config?.tradeSummary?.enabled === false}>
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
              <CardTitle>GICS industry intelligence import</CardTitle>
              <Badge tone="warning">Industry groups</Badge>
            </div>
            <CardDescription>Imports official CSE GICS Summary, Industry Group Indices, and Classification data as a separate enrichment module. This does not replace A–Z or Trade Summary data.</CardDescription>
          </div>
          <Button onClick={handleGicsRun} disabled={runningAlphabetical || runningTradeSummary || runningGics || config?.gics?.enabled === false}>
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
