'use client';

import { useState } from 'react';
import { runCseImport } from '@/lib/api/cse';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { CseImportConfig } from '@/lib/types/cse';
import { getErrorMessage } from '@/lib/api/errors';

export function ImportControlPanel({ config, onRunFinished }: { config?: CseImportConfig | null; onRunFinished?: () => void }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<unknown | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const response = await runCseImport();
      setResult(response);
      onRunFinished?.();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Manual import control</CardTitle>
          <CardDescription>Triggers the backend CSE Listed Company Directory ALPHABETICAL Python HTTP importer.</CardDescription>
        </div>
        <Button onClick={handleRun} disabled={running}>{running ? 'Starting import…' : 'Run CSE Import'}</Button>
      </CardHeader>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl bg-muted p-3">
          <div className="text-xs text-muted-foreground">Current import mode</div>
          <div className="mt-1 font-semibold">{config?.mode || 'python-http'}</div>
        </div>
        <div className="rounded-xl bg-muted p-3">
          <div className="text-xs text-muted-foreground">Scheduler status</div>
          <div className="mt-1 font-semibold">{config ? (config.schedulerEnabled ? 'Enabled' : 'Disabled') : 'Unknown'}</div>
        </div>
        <div className="rounded-xl bg-muted p-3">
          <div className="text-xs text-muted-foreground">Job / letter timeout</div>
          <div className="mt-1 font-semibold">{config?.jobTimeoutSeconds || 300}s / {config?.letterTimeoutSeconds || 30}s</div>
        </div>
        <div className="rounded-xl bg-muted p-3">
          <div className="text-xs text-muted-foreground">Retries / automation mode</div>
          <div className="mt-1 font-semibold">{config?.maxRetries || 3} retries / HTTP API</div>
        </div>
      </div>
      {error ? <Alert tone="danger" className="mt-4"><strong>Import trigger failed:</strong> {error}</Alert> : null}
      {result ? (
        <Alert tone="success" className="mt-4">
          <div className="font-semibold">Import job accepted by backend. Poll the run ID for status.</div>
          <pre className="mt-2 max-h-52 overflow-auto rounded-xl bg-background p-3 text-xs">{JSON.stringify(result, null, 2)}</pre>
        </Alert>
      ) : null}
      <Alert tone="warning" className="mt-4">
        The import secret is never stored in browser code. The button calls a Next.js server route, and that server route forwards the secure header to the backend.
      </Alert>
    </Card>
  );
}
