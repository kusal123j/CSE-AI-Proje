import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAlphabeticalCsv, parseAlphabeticalHtml } from './cse.parser';

const sampleHtml = `
<table><tbody>
<tr>
<td><div style="background-image: url(&quot;https://cdn.cse.lk/cmt/upload_logo/1069.jpeg&quot;);"></div><a href="/company-profile?symbol=AFSL.N0000">ABANS FINANCE PLC</a></td>
<td><span>AFSL.N0000</span></td><td>95.30</td><td>10</td><td>576</td><td>54,899.40</td><td>-3.90</td><td>3.93</td>
</tr>
<tr>
<td><div style="background-image: url('https://cdn.cse.lk/cmt/upload_logo/642.jpeg');"></div><a href="/company-profile?symbol=ABAN.N0000">ABANS ELECTRICALS PLC</a></td>
<td>ABAN.N0000</td><td>1,201.25</td><td>20</td><td>209</td><td>250,753.50</td><td>+10.75</td><td>0.90</td>
</tr>
</tbody></table>`;

test('parseAlphabeticalHtml parses rows and signs losing percentages correctly', () => {
  const rows = parseAlphabeticalHtml(sampleHtml);
  assert.equal(rows.length, 2);
  const loser = rows.find((row) => row.symbol === 'AFSL.N0000');
  if (!loser) throw new Error('Expected AFSL.N0000 loser row');
  assert.equal(loser.changeAmount, -3.9);
  assert.equal(loser.changePercent, -3.93);
  assert.equal(loser.logoUrl, 'https://cdn.cse.lk/cmt/upload_logo/1069.jpeg');
});

test('parseAlphabeticalCsv parses matching CSE CSV headings', () => {
  const rows = parseAlphabeticalCsv(`Company Name,Symbol,Last Traded Price (Rs),Trade Volume,Share Volume,Turnover(Rs),Change(Rs),Change (%)\nABANS FINANCE PLC,AFSL.N0000,95.30,10,576,54899.40,-3.90,3.93`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].changePercent, -3.93);
});
