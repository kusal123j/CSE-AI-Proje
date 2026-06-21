import { describe, expect, it } from 'vitest';
import { buildAzProgress } from './AzProgressGrid';
import type { CseFetchRun, CseRawRunSummary } from '@/lib/types/cse';

describe('buildAzProgress', () => {
  it('returns one status item for each A-Z letter without requiring React rendering', () => {
    const progress = buildAzProgress();

    expect(progress).toHaveLength(26);
    expect(progress.map((item) => item.letter).join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    expect(progress.every((item) => item.status === 'Pending')).toBe(true);
  });

  it('marks failed letters from warning metadata', () => {
    const run = {
      id: 'run-1',
      status: 'PARTIAL_SUCCESS',
      warnings_json: ['ALPHABETICAL B download failed: timeout']
    } satisfies CseFetchRun;

    const progress = buildAzProgress(run);
    expect(progress.find((item) => item.letter === 'B')?.status).toBe('Failed');
  });

  it('marks raw downloaded letters as parsed and clears previous failed warning for that letter', () => {
    const run = {
      id: 'run-1',
      status: 'PARTIAL_SUCCESS',
      warnings_json: ['ALPHABETICAL A download failed: retry happened later']
    } satisfies CseFetchRun;
    const rawSummary = {
      runId: 'run-1',
      available: true,
      files: [{ name: 'A.xlsx', path: '/raw/A.xlsx', letter: 'A', type: 'download' }]
    } satisfies CseRawRunSummary;

    const progress = buildAzProgress(run, rawSummary);
    expect(progress.find((item) => item.letter === 'A')?.status).toBe('Parsed');
  });
});
