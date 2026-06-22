from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx

from .config import settings
from .cse_http_importer import clean_text, normalize_symbol


def _hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str).encode('utf-8')).hexdigest()


def _headers() -> dict[str, str]:
    return {
        'User-Agent': settings.cse_import_user_agent,
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': 'https://www.cse.lk',
        'Referer': 'https://www.cse.lk/',
    }




def normalize_cse_pdf_url(value: str | None) -> str | None:
    text = clean_text(value)
    if not text or '.pdf' not in text.lower():
        return None
    if re.match(r'^(javascript|data):', text, re.I):
        return None
    absolute = urljoin('https://www.cse.lk/', text)
    parsed = urlparse(absolute)
    host = (parsed.hostname or '').lower()
    if host not in {'www.cse.lk', 'cse.lk', 'cdn.cse.lk'}:
        return None
    path = parsed.path.replace('\\', '/')
    path = re.sub(r'^/api/cmt/', '/cmt/', path, flags=re.I)
    if not path.lower().endswith('.pdf'):
        return None
    if not re.search(r'/cmt/upload_report_file/[^?#]+\.pdf$', path, re.I):
        return None
    return f'https://cdn.cse.lk{path}'


def _post_api(api_url: str, data: dict[str, Any]) -> Any:
    with httpx.Client(timeout=settings.cse_company_financial_reports_timeout_seconds, headers=_headers(), follow_redirects=True) as client:
        response = client.post(api_url, data=data)
        response.raise_for_status()
        try:
            return response.json()
        except ValueError:
            return {'rawText': response.text}


def _walk(value: Any) -> list[Any]:
    if isinstance(value, list):
        items: list[Any] = []
        for child in value:
            items.extend(_walk(child))
        return items
    if isinstance(value, dict):
        children = [value]
        for child in value.values():
            if isinstance(child, (dict, list)):
                children.extend(_walk(child))
        return children
    return []


def _value(record: dict[str, Any], keys: list[str]) -> Any:
    wanted = {re.sub(r'[^a-z0-9]+', '', key.lower()) for key in keys}
    for key, value in record.items():
        if re.sub(r'[^a-z0-9]+', '', str(key).lower()) in wanted and clean_text(value):
            return value
    return None


def _date(value: Any) -> str | None:
    text = clean_text(value)
    if not text:
        return None
    match = re.search(r'(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})', text)
    if match:
        return f'{match.group(1)}-{int(match.group(2)):02d}-{int(match.group(3)):02d}'
    match = re.search(r'(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})', text)
    if match:
        return f'{match.group(3)}-{int(match.group(2)):02d}-{int(match.group(1)):02d}'
    return None


def _raw_pdf_url(record: dict[str, Any], api_url: str) -> str | None:
    value = _value(record, ['pdfUrl', 'fileUrl', 'downloadUrl', 'url', 'href', 'filePath', 'path'])
    text = clean_text(value)
    if not text or '.pdf' not in text.lower():
        return None
    return urljoin(api_url, text)


def _pdf_url(record: dict[str, Any], api_url: str) -> str | None:
    return normalize_cse_pdf_url(_raw_pdf_url(record, api_url))


def _report_type(title: str, record: dict[str, Any]) -> str:
    raw = f"{title} {json.dumps(record, default=str)}".lower()
    if 'annual' in raw:
        return 'ANNUAL_REPORT'
    if 'quarter' in raw or 'interim' in raw or 'q1' in raw or 'q2' in raw or 'q3' in raw or 'q4' in raw:
        return 'INTERIM_REPORT'
    return 'OTHER_REPORT'


def _financial_year(title: str, record: dict[str, Any]) -> str | None:
    value = clean_text(_value(record, ['financialYear', 'year', 'fiscalYear']))
    if value:
        return value
    match = re.search(r'(20\d{2}|19\d{2})', title)
    return match.group(1) if match else None


def _period(title: str, record: dict[str, Any]) -> str | None:
    value = clean_text(_value(record, ['period', 'quarter', 'reportPeriod']))
    if value:
        return value
    match = re.search(r'(Q[1-4]|Quarter\s*[1-4]|1st Quarter|2nd Quarter|3rd Quarter|4th Quarter|Interim)', title, re.I)
    return clean_text(match.group(0)) if match else None


def _rows_from_payload(payload: Any) -> list[dict[str, Any]]:
    rows = []
    for record in _walk(payload):
        if not isinstance(record, dict):
            continue
        title = clean_text(_value(record, ['title', 'name', 'description', 'announcementTitle', 'reportName']))
        pdf = _pdf_url(record, 'https://www.cse.lk/')
        if title and (pdf or 'annual' in title.lower() or 'quarter' in title.lower() or 'interim' in title.lower()):
            rows.append(record)
    return rows


def run_financial_reports_import(symbol: str, api_url: str) -> dict[str, Any]:
    normalized_symbol = normalize_symbol(symbol)
    warnings: list[str] = []
    payload = _post_api(api_url, {'symbol': normalized_symbol})
    records = _rows_from_payload(payload)
    reports = []
    for record in records:
        title = clean_text(_value(record, ['title', 'name', 'description', 'announcementTitle', 'reportName'])) or 'CSE Financial Report'
        original_pdf = _raw_pdf_url(record, api_url)
        pdf = normalize_cse_pdf_url(original_pdf)
        reports.append({
            'symbol': normalized_symbol,
            'reportType': _report_type(title, record),
            'title': title,
            'financialYear': _financial_year(title, record),
            'period': _period(title, record),
            'publishedDate': _date(_value(record, ['publishedDate', 'date', 'announcementDate', 'releaseDate'])),
            'pdfUrl': pdf,
            'originalPdfUrl': original_pdf,
            'sourceUrl': api_url,
            'sourceDocumentId': clean_text(_value(record, ['id', 'documentId', 'announcementId'])) or None,
            'payloadHash': _hash(record),
            'rawRow': record,
        })
    if not reports:
        warnings.append('No financial report rows were detected from CSE response for this symbol.')
    return {
        'status': 'success',
        'sourceUrl': api_url,
        'fetchMode': 'python-http',
        'fetchStrategy': 'api-first-html-fallback',
        'browserAutomationEnabled': False,
        'fetchedAt': datetime.now(timezone.utc).isoformat(),
        'warnings': warnings,
        'reports': reports,
        'rawPayload': payload,
    }
