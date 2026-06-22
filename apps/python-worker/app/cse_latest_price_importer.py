from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any

import httpx

from .config import settings
from .cse_http_importer import clean_text, normalize_int, normalize_number, normalize_symbol


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


def _post_api(api_url: str, data: dict[str, Any] | None = None) -> Any:
    with httpx.Client(timeout=settings.cse_latest_price_timeout_seconds, headers=_headers(), follow_redirects=True) as client:
        response = client.post(api_url, data=data or {})
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


def _row_to_price(record: dict[str, Any], market_status: str | None) -> dict[str, Any] | None:
    symbol = normalize_symbol(_value(record, ['symbol', 'securitySymbol', 'code']))
    if not symbol:
        return None
    return {
        'symbol': symbol,
        'lastTradedPrice': normalize_number(_value(record, ['lastTradedPrice', 'last traded price', 'ltp', 'price'])),
        'changeAmount': normalize_number(_value(record, ['change', 'changeAmount', 'changeRs'])),
        'changePercent': normalize_number(_value(record, ['changePercentage', 'changePercent', 'percentageChange'])),
        'previousClose': normalize_number(_value(record, ['previousClose', 'prevClose'])),
        'openPrice': normalize_number(_value(record, ['open', 'openPrice'])),
        'highPrice': normalize_number(_value(record, ['high', 'highPrice'])),
        'lowPrice': normalize_number(_value(record, ['low', 'lowPrice'])),
        'turnover': normalize_number(_value(record, ['turnover'])),
        'shareVolume': normalize_int(_value(record, ['shareVolume', 'volume'])),
        'tradeVolume': normalize_int(_value(record, ['tradeVolume', 'trades'])),
        'marketCap': normalize_number(_value(record, ['marketCap', 'marketCapitalization'])),
        'marketStatus': market_status,
        'tradeTime': None,
        'source': 'CSE_TODAY_SHARE_PRICE',
        'rawPayloadHash': _hash(record),
        'rawPayload': record,
    }


def _market_status(payload: Any) -> str | None:
    if isinstance(payload, dict):
        for key in ['marketStatus', 'status', 'market_status', 'marketStatusDescription']:
            if clean_text(payload.get(key)):
                return clean_text(payload.get(key))
    text = clean_text(payload)
    return text[:100] if text else None


def _market_is_open(status: str | None) -> bool | None:
    normalized = (status or '').strip().lower()
    if not normalized:
        return None
    if any(token in normalized for token in ['closed', 'close', 'holiday', 'halted', 'not open']):
        return False
    if any(token in normalized for token in ['open', 'trading', 'continuous', 'pre-open', 'pre open']):
        return True
    return None


def run_latest_prices_import(api_url: str, market_status_url: str | None = None, skip_when_market_closed: bool = False) -> dict[str, Any]:
    warnings: list[str] = []
    market_payload: Any = None
    market_status: str | None = None
    if market_status_url:
        try:
            market_payload = _post_api(market_status_url, {})
            market_status = _market_status(market_payload)
        except Exception as exc:
            warnings.append(f'Market status API failed but latest price fetch will continue: {exc}')
    market_is_open = _market_is_open(market_status)
    if skip_when_market_closed and market_is_open is False:
        warnings.append('Market status indicates closed; latest price fetch skipped for scheduled poll.')
        return {
            'status': 'success',
            'sourceUrl': api_url,
            'fetchMode': 'python-http',
            'fetchStrategy': 'market-status-first-skip-closed',
            'browserAutomationEnabled': False,
            'fetchedAt': datetime.now(timezone.utc).isoformat(),
            'marketStatus': market_status,
            'marketIsOpen': False,
            'warnings': warnings,
            'prices': [],
            'rawPayload': {'marketStatus': market_payload, 'todaySharePrice': None},
        }
    payload = _post_api(api_url, {})
    prices = []
    for record in _walk(payload):
        if isinstance(record, dict):
            row = _row_to_price(record, market_status)
            if row:
                prices.append(row)
    # Deduplicate by symbol, preserving first occurrence from CSE response.
    seen: set[str] = set()
    deduped = []
    for price in prices:
        if price['symbol'] in seen:
            continue
        seen.add(price['symbol'])
        deduped.append(price)
    if not deduped:
        warnings.append('No latest price rows were detected from CSE todaySharePrice response.')
    return {
        'status': 'success',
        'sourceUrl': api_url,
        'fetchMode': 'python-http',
        'fetchStrategy': 'bulk-api-primary',
        'browserAutomationEnabled': False,
        'fetchedAt': datetime.now(timezone.utc).isoformat(),
        'marketStatus': market_status,
        'marketIsOpen': market_is_open,
        'warnings': warnings,
        'prices': deduped,
        'rawPayload': {'marketStatus': market_payload, 'todaySharePrice': payload},
    }
