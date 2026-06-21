import type { AzLetterProgress, CseFetchRun, CseRawRunSummary, LetterStatus } from '@/lib/types/cse';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const statusClasses: Record<LetterStatus, string> = {
  Pending: 'border-border bg-muted text-muted-foreground',
  Downloading: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  Downloaded: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  Parsed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  Failed: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
  Skipped: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  Unknown: 'border-border bg-card text-muted-foreground'
};

function warningText(run?: CseFetchRun | null): string[] {
  const raw = run?.warnings_json;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return [raw];
    }
  }
  return [];
}

function countByStatus(progress: AzLetterProgress[], status: LetterStatus): number {
  return progress.filter((item) => item.status === status).length;
}

export function buildAzProgress(run?: CseFetchRun | null, rawSummary?: CseRawRunSummary | null): AzLetterProgress[] {
  const failed = new Set<string>();
  for (const warning of warningText(run)) {
    const match = warning.match(/ALPHABETICAL\s+([A-Z])\s+download failed/i);
    if (match?.[1]) failed.add(match[1].toUpperCase());
  }
  for (const file of rawSummary?.files ?? []) {
    if (file.letter && file.type === 'download') failed.delete(file.letter.toUpperCase());
  }
  const downloaded = new Set((rawSummary?.files ?? []).map((file) => file.letter?.toUpperCase()).filter(Boolean) as string[]);

  return LETTERS.map((letter) => {
    let status: LetterStatus = 'Unknown';
    let message = 'No per-letter state was persisted for this letter.';
    if (failed.has(letter)) {
      status = 'Failed';
      message = 'Download failed according to latest fetch-run warnings.';
    } else if (downloaded.has(letter)) {
      status = 'Parsed';
      message = 'A raw downloaded file was found for this letter in the raw summary.';
    } else if (!run) {
      status = 'Pending';
      message = 'No fetch run is available yet.';
    } else if (run.status === 'RUNNING') {
      status = 'Unknown';
      message = 'A run is marked running, but live per-letter streaming is not available yet.';
    }
    return { letter, status, message };
  });
}

export function AzProgressGrid({ run, rawSummary }: { run?: CseFetchRun | null; rawSummary?: CseRawRunSummary | null }) {
  const progress = buildAzProgress(run, rawSummary);
  const failedCount = countByStatus(progress, 'Failed');
  const parsedCount = countByStatus(progress, 'Parsed');
  const unknownCount = countByStatus(progress, 'Unknown');

  return (
    <div>
      <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-100">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="warning">Realtime: Not available</Badge>
          <Badge tone="info">Mode: Latest run snapshot</Badge>
          <Badge tone={failedCount ? 'danger' : 'success'}>Failed letters: {failedCount}</Badge>
          <Badge tone="success">Parsed from raw files: {parsedCount}</Badge>
          <Badge tone="muted">Unknown: {unknownCount}</Badge>
        </div>
        <p className="mt-2">
          This grid does not show live browser progress yet. It reconstructs A–Z status from stored fetch-run metadata, warnings, and raw file summary when available.
          Persistent per-letter import state is documented as a backend enhancement.
        </p>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7 md:grid-cols-9 lg:[grid-template-columns:repeat(13,minmax(0,1fr))]">
        {progress.map((item) => (
          <div
            key={item.letter}
            title={item.message || item.status}
            className={cn('flex min-h-16 flex-col items-center justify-center rounded-xl border text-center text-xs font-semibold', statusClasses[item.status])}
          >
            <div className="text-lg">{item.letter}</div>
            <div>{item.status}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
