import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { mergeAndDedupeAlphabeticalRows, parseAlphabeticalExportFile } from './cse.exportParser';

const csv = `Company Name,Symbol,Last Traded Price (Rs),Trade Volume,Share Volume,Turnover(Rs),Change(Rs),Change (%)\nABANS FINANCE PLC,AFSL.N0000,95.30,10,576,54899.40,-3.90,3.93\nABANS ELECTRICALS PLC,ABAN.N0000,1201.25,20,209,250753.50,+10.75,0.90`;

test('parseAlphabeticalExportFile parses downloaded CSV files and tags source letter', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cse-export-'));
  const filePath = path.join(dir, 'A.csv');
  await fs.writeFile(filePath, csv, 'utf8');
  const rows = await parseAlphabeticalExportFile(filePath, 'A');
  assert.equal(rows.length, 2);
  const loser = rows.find((row) => row.symbol === 'AFSL.N0000');
  assert.equal(loser?.sourceLetter, 'A');
  assert.equal(loser?.changePercent, -3.93);
});

test('mergeAndDedupeAlphabeticalRows removes duplicate symbols across A-Z exports', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cse-export-'));
  const aPath = path.join(dir, 'A.csv');
  const bPath = path.join(dir, 'B.csv');
  await fs.writeFile(aPath, csv, 'utf8');
  await fs.writeFile(
    bPath,
    `Company Name,Symbol,Last Traded Price (Rs),Trade Volume,Share Volume,Turnover(Rs),Change(Rs),Change (%)\nABANS FINANCE PLC,AFSL.N0000,96.00,11,600,57600.00,-2.00,2.04\nBROWNS PLC,BIL.N0000,7.10,1,100,710.00,0.10,1.43`,
    'utf8'
  );
  const rows = [
    ...(await parseAlphabeticalExportFile(aPath, 'A')),
    ...(await parseAlphabeticalExportFile(bPath, 'B'))
  ];
  const merged = mergeAndDedupeAlphabeticalRows(rows);
  assert.equal(merged.recordsBeforeDeduplication, 4);
  assert.equal(merged.recordsDeduplicated, 1);
  assert.equal(merged.rows.length, 3);
  assert.equal(merged.rows.find((row) => row.symbol === 'AFSL.N0000')?.sourceLetter, 'B');
});
