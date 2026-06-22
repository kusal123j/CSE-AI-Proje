#!/usr/bin/env python3
"""Verify live CSE company-intelligence endpoints without writing to the database.

This script intentionally uses only lightweight HTTP requests and avoids any
real browser automation or third-party unofficial repo code. It captures raw
response shapes for operational confidence and fixture refresh.
"""
from __future__ import annotations

import argparse
import json
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import httpx

DEFAULT_SYMBOLS = ['AFSL.N0000', 'LOLC.N0000', 'COMB.N0000', 'JKH.N0000', 'BIL.N0000']
DEFAULT_BASE = 'https://www.cse.lk/api'


def headers() -> dict[str, str]:
    return {
        'User-Agent': 'CSE-AI-Research-Assistant/1.0 live-verifier (+https://www.cse.lk)',
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': 'https://www.cse.lk',
        'Referer': 'https://www.cse.lk/',
    }


def post(client: httpx.Client, url: str, data: dict[str, Any] | None = None) -> dict[str, Any]:
    response = client.post(url, data=data or {})
    result: dict[str, Any] = {
        'url': url,
        'requestData': data or {},
        'httpStatus': response.status_code,
        'ok': response.is_success,
    }
    try:
        result['payload'] = response.json()
    except ValueError:
        result['payload'] = {'rawText': response.text[:5000]}
    return result


def shape(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return {'type': 'object', 'keys': sorted(list(value.keys()))[:80], 'childCount': len(value)}
    if isinstance(value, list):
        first = value[0] if value else None
        return {'type': 'array', 'length': len(value), 'firstShape': shape(first) if first is not None else None}
    return {'type': type(value).__name__, 'preview': str(value)[:120]}


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True, default=str), encoding='utf-8')


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--symbols', nargs='*', default=DEFAULT_SYMBOLS)
    parser.add_argument('--output-dir', default='apps/python-worker/tests/fixtures/cse/live_verified')
    parser.add_argument('--start-date', default=(date.today() - timedelta(days=30)).isoformat())
    parser.add_argument('--end-date', default=date.today().isoformat())
    parser.add_argument('--timeout', type=float, default=30.0)
    args = parser.parse_args()

    out = Path(args.output_dir)
    report: list[dict[str, Any]] = []
    endpoints = {
        'companyInfoSummery': f'{DEFAULT_BASE}/companyInfoSummery',
        'getFinancialAnnouncement': f'{DEFAULT_BASE}/getFinancialAnnouncement',
        'approvedAnnouncement': f'{DEFAULT_BASE}/approvedAnnouncement',
        'todaySharePrice': f'{DEFAULT_BASE}/todaySharePrice',
        'marketStatus': f'{DEFAULT_BASE}/marketStatus',
    }

    with httpx.Client(headers=headers(), timeout=args.timeout, follow_redirects=True) as client:
        for symbol in args.symbols:
            symbol_key = symbol.replace('.', '_')
            calls = {
                'company_profile': (endpoints['companyInfoSummery'], {'symbol': symbol}),
                'financial_reports': (endpoints['getFinancialAnnouncement'], {'symbol': symbol}),
                'announcements': (endpoints['approvedAnnouncement'], {'symbol': symbol, 'fromDate': args.start_date, 'toDate': args.end_date}),
            }
            for name, (url, data) in calls.items():
                result = post(client, url, data)
                write_json(out / f'{name}_{symbol_key}.json', result)
                report.append({
                    'name': name,
                    'symbol': symbol,
                    'httpStatus': result['httpStatus'],
                    'ok': result['ok'],
                    'requestData': data,
                    'shape': shape(result.get('payload')),
                })

        for name in ['todaySharePrice', 'marketStatus']:
            result = post(client, endpoints[name], {})
            write_json(out / f'{name}.json', result)
            report.append({
                'name': name,
                'symbol': None,
                'httpStatus': result['httpStatus'],
                'ok': result['ok'],
                'requestData': {},
                'shape': shape(result.get('payload')),
            })

    write_json(out / 'CSE_LIVE_API_VERIFICATION_REPORT.json', report)
    md_lines = ['# CSE Live API Verification Report', '', f'Symbols: {", ".join(args.symbols)}', f'Date range: {args.start_date} to {args.end_date}', '']
    for item in report:
        md_lines.append(f"- **{item['name']}** {item.get('symbol') or ''}: HTTP {item['httpStatus']} ok={item['ok']} shape={item['shape']}")
    (out / 'CSE_LIVE_API_VERIFICATION_REPORT.md').write_text('\n'.join(md_lines) + '\n', encoding='utf-8')
    print(f'Wrote live verification fixtures/report to {out}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
