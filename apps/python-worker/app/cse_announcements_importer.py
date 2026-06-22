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
    with httpx.Client(timeout=settings.cse_company_announcements_timeout_seconds, headers=_headers(), follow_redirects=True) as client:
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


def _rows_from_payload(payload: Any) -> list[dict[str, Any]]:
    rows = []
    for record in _walk(payload):
        if not isinstance(record, dict):
            continue
        title = clean_text(_value(record, ['title', 'name', 'description', 'announcementTitle', 'subject']))
        if title or _pdf_url(record, 'https://www.cse.lk/'):
            rows.append(record)
    return rows


def run_announcements_import(symbol: str, start_date: str, end_date: str, api_url: str) -> dict[str, Any]:
    normalized_symbol = normalize_symbol(symbol)
    warnings: list[str] = []
    payload = _post_api(api_url, {
        'symbol': normalized_symbol,
        'fromDate': start_date,
        'toDate': end_date,
        'startDate': start_date,
        'endDate': end_date,
    })
    records = _rows_from_payload(payload)
    announcements = []
    for record in records:
        title = clean_text(_value(record, ['title', 'name', 'description', 'announcementTitle', 'subject'])) or 'CSE Announcement'
        published_date = _date(_value(record, ['publishedDate', 'date', 'announcementDate', 'releaseDate']))
        original_pdf = _raw_pdf_url(record, api_url)
        pdf = normalize_cse_pdf_url(original_pdf)
        announcements.append({
            'symbol': normalized_symbol,
            'announcementTitle': title,
            'announcementCategory': clean_text(_value(record, ['category', 'type', 'announcementCategory'])) or None,
            'publishedAt': None,
            'publishedDate': published_date,
            'pdfUrl': pdf,
            'originalPdfUrl': original_pdf,
            'sourceUrl': api_url,
            'sourceAnnouncementId': clean_text(_value(record, ['id', 'announcementId', 'documentId'])) or None,
            'payloadHash': _hash(record),
            'rawRow': record,
        })
    if not announcements:
        warnings.append('No announcement rows were detected from CSE response for this symbol and date range.')
    return {
        'status': 'success',
        'sourceUrl': api_url,
        'fetchMode': 'python-http',
        'fetchStrategy': 'date-range-api',
        'browserAutomationEnabled': False,
        'fetchedAt': datetime.now(timezone.utc).isoformat(),
        'warnings': warnings,
        'startDate': start_date,
        'endDate': end_date,
        'announcements': announcements,
        'rawPayload': payload,
    }
