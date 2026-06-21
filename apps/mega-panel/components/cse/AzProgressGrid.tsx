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
  const validation = run?.validation_report ?? rawSummary?.validationReport ?? null;
  const validationByLetter = new Map((validation?.letterResults ?? []).map((item) => [item.letter.toUpperCase(), item]));
  const rawLetters = new Set([
    ...(rawSummary?.files ?? []).map((file) => file.letter?.toUpperCase()).filter(Boolean) as string[],
    ...(rawSummary?.dbArtifacts ?? []).map((artifact) => artifact.letter?.toUpperCase()).filter(Boolean) as string[]
  ]);
  const failed = new Set<string>();
  for (const failure of validation?.failedLetters ?? []) failed.add(failure.letter.toUpperCase());
  for (const warning of warningText(run)) {
    const match = warning.match(/ALPHABETICAL\s+API\s+([A-Z])\s+/i) || warning.match(/ALPHABETICAL\s+([A-Z])\s+/i);
    if (match?.[1]) failed.add(match[1].toUpperCase());
  }

  return LETTERS.map((letter) => {
    const validationItem = validationByLetter.get(letter);
    let status: LetterStatus = 'Unknown';
    let message = 'No per-letter state was persisted for this letter.';

    if (validationItem) {
      if (validationItem.status === 'failed') {
        status = 'Failed';
        message = `${validationItem.error || 'Letter failed'}${validationItem.attempts ? ` after ${validationItem.attempts} attempts` : ''}.`;
      } else if (validationItem.status === 'empty') {
        status = 'Skipped';
        message = `Valid empty letter. Attempts: ${validationItem.attempts ?? 1}.`;
      } else {
        status = 'Parsed';
        message = `Parsed ${validationItem.rowCount ?? 0} rows. Attempts: ${validationItem.attempts ?? 1}.`;
      }
    } else if (failed.has(letter)) {
      status = 'Failed';
      message = 'Letter failed according to latest fetch-run warnings.';
    } else if (rawLetters.has(letter)) {
      status = 'Parsed';
      message = 'A raw per-letter artifact was found for this letter.';
    } else if (!run) {
      status = 'Pending';
      message = 'No fetch run is available yet.';
    } else if (run.status === 'RUNNING') {
      status = 'Downloading';
      message = 'The import run is currently running. Poll latest run/raw summary for updates.';
    }
    return { letter, status, message };
  });
}

export function AzProgressGrid({ run, rawSummary }: { run?: CseFetchRun | null; rawSummary?: CseRawRunSummary | null }) {
  const progress = buildAzProgress(run, rawSummary);
  const failedCount = countByStatus(progress, 'Failed');
  const parsedCount = countByStatus(progress, 'Parsed');
  const emptyCount = countByStatus(progress, 'Skipped');
  const unknownCount = countByStatus(progress, 'Unknown');

  return (
    <div>
      <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-100">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info">Mode: HTTP/API A-Z</Badge>
          <Badge tone={failedCount ? 'danger' : 'success'}>Failed letters: {failedCount}</Badge>
          <Badge tone="success">Parsed: {parsedCount}</Badge>
          <Badge tone="warning">Valid empty: {emptyCount}</Badge>
          <Badge tone="muted">Unknown: {unknownCount}</Badge>
        </div>
        <p className="mt-2">
          This grid reconstructs A-Z status from validation metadata, retry attempts, warnings, and raw per-letter artifacts. It does not use browser automation events.
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
