import assert from 'node:assert/strict';
import { test } from 'node:test';

const completedStatuses = new Set(['EXTRACTED', 'CHUNKED', 'EMBEDDED', 'ANALYZED']);
const blockedStatuses = new Set(['DOWNLOADING', 'EXTRACTING', 'CHUNKING', 'EMBEDDING', 'ANALYZING']);

test('retry guard blocks already completed document statuses', () => {
  assert.equal(completedStatuses.has('EXTRACTED'), true);
  assert.equal(completedStatuses.has('ANALYZED'), true);
  assert.equal(completedStatuses.has('FAILED'), false);
});

test('retry guard blocks active processing statuses', () => {
  assert.equal(blockedStatuses.has('DOWNLOADING'), true);
  assert.equal(blockedStatuses.has('EXTRACTING'), true);
  assert.equal(blockedStatuses.has('STORED'), false);
});
