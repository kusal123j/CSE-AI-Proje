from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import parse_qs, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field, field_validator
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .config import settings
from .cse_http_importer import CseImportError, CseImportFetchError, CseImportParseError, clean_text, normalize_symbol


class TradeSummaryRow(BaseModel):
    company_name: str = Field(min_length=1)
    normalized_company_name: str = Field(min_length=1)
    symbol: str = Field(min_length=1)
    normalized_symbol: str = Field(min_length=1)
    share_volume: int | None = None
    trade_volume: int | None = None
    previous_close: float | None = None
    open_price: float | None = None
    high_price: float | None = None
    low_price: float | None = None
    last_traded_price: float | None = None
    change_amount: float | None = None
    change_percent: float | None = None
    turnover: float | None = None
    is_watch_list: bool = False
    watch_list_detection_source: str | None = None
    raw_row: dict[str, Any] = Field(default_factory=dict)

    @field_validator("symbol", "normalized_symbol")
    @classmethod
    def validate_symbol(cls, value: str) -> str:
        normalized = normalize_symbol(value)
        if not normalized:
            raise ValueError("symbol is required")
        return normalized

    @field_validator("company_name", "normalized_company_name")
    @classmethod
    def validate_company_name(cls, value: str) -> str:
        cleaned = clean_text(value)
        if not cleaned:
            raise ValueError("company name is required")
        return cleaned

    def to_backend_dict(self) -> dict[str, Any]:
        return {
            "companyName": self.company_name,
            "normalizedCompanyName": self.normalized_company_name,
            "symbol": self.symbol,
            "normalizedSymbol": self.normalized_symbol,
            "shareVolume": self.share_volume,
            "tradeVolume": self.trade_volume,
            "previousClose": self.previous_close,
            "openPrice": self.open_price,
            "highPrice": self.high_price,
            "lowPrice": self.low_price,
            "lastTradedPrice": self.last_traded_price,
            "turnover": self.turnover,
            "changeAmount": self.change_amount,
            "changePercent": self.change_percent,
            "isWatchList": self.is_watch_list,
            "watchListDetectionSource": self.watch_list_detection_source,
            "rawRow": self.raw_row,
        }


def assert_trade_summary_source_url(source_url: str) -> None:
    parsed = urlparse(source_url)
    if parsed.scheme not in {"http", "https"}:
        raise CseImportError("Invalid CSE Trade Summary source URL")
    if parsed.hostname not in {"www.cse.lk", "cse.lk"}:
        raise CseImportError("Only cse.lk URLs are allowed for the Trade Summary importer")
    if "/equity/trade-summary" not in parsed.path:
        raise CseImportError("Only the CSE equity/trade-summary page is allowed for this importer")


def api_url_from_source(source_url: str) -> str:
    parsed = urlparse(source_url)
    return f"{parsed.scheme}://{parsed.netloc}/api/tradeSummary"


def normalize_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def first_value(record: dict[str, Any], aliases: list[str]) -> Any:
    normalized_map = {normalize_key(key): value for key, value in record.items()}
    for alias in aliases:
        key = normalize_key(alias)
        if key in normalized_map:
            return normalized_map[key]
    return None


def parse_decimal(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float, Decimal)):
        return float(value)
    text = clean_text(str(value))
    if not text or text in {"-", "—", "N/A", "NA"}:
        return None
    text = text.replace("%", "").replace(",", "").replace("+", "")
    text = re.sub(r"[^0-9.\-]", "", text)
    if text in {"", "-", "."}:
        return None
    try:
        return float(Decimal(text))
    except (InvalidOperation, ValueError):
        return None


def parse_int(value: Any) -> int | None:
    number = parse_decimal(value)
    if number is None:
        return None
    return int(number)


def truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    text = clean_text(str(value)).lower()
    if text in {"0", "false", "no", "n", "", "none", "null"}:
        return False
    return text in {"1", "true", "yes", "y", "watch", "watchlist", "watch list", "highlight", "highlighted"} or "watch" in text


def infer_watch_list(record: dict[str, Any]) -> tuple[bool, str | None]:
    explicit_aliases = [
        "isWatchList",
        "is_watch_list",
        "watchList",
        "watch_list",
        "watchlist",
        "isWatchListed",
        "is_watch_listed",
        "highlighted",
        "isHighlighted",
        "highlightStatus",
    ]
    for alias in explicit_aliases:
        value = first_value(record, [alias])
        if value is not None and truthy(value):
            return True, f"api_field:{alias}"

    status_aliases = ["status", "securityStatus", "watchStatus", "remarks", "remark", "note", "notes", "category", "flag"]
    for alias in status_aliases:
        value = first_value(record, [alias])
        if value is not None and "watch" in clean_text(str(value)).lower():
            return True, f"status_text:{alias}"

    css_value = first_value(record, ["rowClass", "cssClass", "class", "row_class"])
    if css_value is not None:
        css = clean_text(str(css_value)).lower()
        if "highlight" in css or "watch" in css or "bg-highlight-status" in css:
            return True, "html_class"

    return False, None


def infer_change_percent(record: dict[str, Any], raw_value: Any) -> float | None:
    value = parse_decimal(raw_value)
    if value is None:
        return None
    if value < 0:
        return value
    # Some CSE UI/API payloads expose the percent as an absolute value and the direction separately.
    direction = clean_text(str(first_value(record, ["direction", "changeDirection", "priceDirection", "indicator", "status", "movement", "changeType"] ) or "")).lower()
    if any(token in direction for token in ["down", "decrease", "negative", "loss", "red", "minus"]):
        return -abs(value)
    return value


def company_from_record(record: dict[str, Any]) -> str:
    value = first_value(
        record,
        [
            "companyName",
            "company_name",
            "company",
            "name",
            "securityName",
            "security",
            "Company",
            "COMPANY",
            "company_name_en",
        ],
    )
    return clean_text(str(value or ""))


def symbol_from_record(record: dict[str, Any]) -> str:
    value = first_value(record, ["symbol", "Symbol", "SYMBOL", "securitySymbol", "security", "code", "secuCode"])
    return normalize_symbol(str(value or ""))


def row_from_record(record: dict[str, Any]) -> TradeSummaryRow | None:
    company_name = company_from_record(record)
    symbol = symbol_from_record(record)
    if not company_name or not symbol:
        return None

    change_percent_raw = first_value(record, ["changePercent", "change_percentage", "changePercentage", "Change (%)", "Change %", "percentageChange", "perChange"])
    is_watch_list, watch_list_detection_source = infer_watch_list(record)

    return TradeSummaryRow(
        company_name=company_name,
        normalized_company_name=company_name.upper(),
        symbol=symbol,
        normalized_symbol=symbol,
        share_volume=parse_int(first_value(record, ["shareVolume", "share_volume", "Share Volume", "SHARE_VOLUME", "sharevolume", "volume"])),
        trade_volume=parse_int(first_value(record, ["tradeVolume", "trade_volume", "Trade Volume", "TRADE_VOLUME", "trades", "noOfTrades", "numberOfTrades"])),
        previous_close=parse_decimal(first_value(record, ["previousClose", "previous_close", "Previous Close", "Previous Close (Rs.)", "prevClose", "previousClosingPrice"])),
        open_price=parse_decimal(first_value(record, ["open", "openPrice", "open_price", "Open", "Open (Rs.)", "openingPrice"])),
        high_price=parse_decimal(first_value(record, ["high", "highPrice", "high_price", "High", "High (Rs.)"])),
        low_price=parse_decimal(first_value(record, ["low", "lowPrice", "low_price", "Low", "Low (Rs.)"])),
        last_traded_price=parse_decimal(first_value(record, ["lastTrade", "last_traded_price", "lastTradedPrice", "Last Trade", "Last Trade (Rs.)", "last", "close"])),
        turnover=parse_decimal(first_value(record, ["turnover", "Turnover", "turnOver", "value", "tradeValue"])),
        change_amount=parse_decimal(first_value(record, ["changeAmount", "change_amount", "Change (Rs.)", "Change Rs", "change", "priceChange"])),
        change_percent=infer_change_percent(record, change_percent_raw),
        is_watch_list=is_watch_list,
        watch_list_detection_source=watch_list_detection_source,
        raw_row=record,
    )


def find_records(payload: Any) -> list[dict[str, Any]]:
    known_keys = [
        "tradeSummary",
        "tradeSummery",
        "reqTradeSummary",
        "reqTradeSummery",
        "data",
        "rows",
        "result",
        "items",
        "aaData",
    ]
    if isinstance(payload, dict):
        for key in known_keys:
            value = payload.get(key)
            if isinstance(value, list) and any(isinstance(item, dict) for item in value):
                return [item for item in value if isinstance(item, dict)]
        # Fall back to the largest list of dictionaries that looks like security rows.
        candidates: list[list[dict[str, Any]]] = []
        stack = [payload]
        while stack:
            current = stack.pop()
            if isinstance(current, dict):
                stack.extend(current.values())
            elif isinstance(current, list):
                dict_items = [item for item in current if isinstance(item, dict)]
                if dict_items:
                    candidates.append(dict_items)
                stack.extend(current)
        if candidates:
            candidates.sort(key=len, reverse=True)
            return candidates[0]
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    return []


def market_timestamp_from_payload(payload: Any) -> tuple[str | None, str | None]:
    keys = ["marketTimestamp", "marketTime", "marketDateTime", "asOf", "asAt", "date", "time", "lastUpdated", "updatedAt"]
    if isinstance(payload, dict):
        for key in keys:
            value = first_value(payload, [key])
            if value:
                text = clean_text(str(value))
                return text, text
    return None, None


@retry(
    retry=retry_if_exception_type((httpx.TimeoutException, httpx.TransportError, CseImportFetchError)),
    stop=stop_after_attempt(settings.cse_import_max_retries),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    reraise=True,
)
def fetch_trade_summary_api(source_url: str) -> tuple[dict[str, Any], list[TradeSummaryRow], list[str]]:
    url = api_url_from_source(source_url)
    headers = {
        "User-Agent": settings.cse_import_user_agent,
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Referer": source_url,
        "Origin": "https://www.cse.lk",
    }
    try:
        with httpx.Client(timeout=settings.cse_import_timeout_seconds, follow_redirects=True, headers=headers) as client:
            response = client.post(url, data={})
    except (httpx.TimeoutException, httpx.TransportError) as exc:
        raise CseImportFetchError(f"CSE Trade Summary API fetch failed: {exc}") from exc

    if response.status_code != 200:
        raise CseImportFetchError(f"CSE Trade Summary API returned status {response.status_code}")
    try:
        payload = response.json()
    except ValueError as exc:
        raise CseImportParseError(f"CSE Trade Summary API returned invalid JSON: {exc}") from exc

    records = find_records(payload)
    rows: list[TradeSummaryRow] = []
    warnings: list[str] = []
    for index, record in enumerate(records, start=1):
        row = row_from_record(record)
        if row is None:
            warnings.append(f"Skipped Trade Summary API row {index}: missing company name or symbol.")
            continue
        row.raw_row = {**row.raw_row, "sourceEndpoint": url, "sourceMode": "api"}
        rows.append(row)
    if not rows:
        raise CseImportParseError("No Trade Summary rows were parsed from the CSE API response")
    return {"statusCode": response.status_code, "endpoint": url, "payload": payload}, rows, warnings


def parse_csv_rows(text: str) -> list[dict[str, Any]]:
    sample = text.lstrip("\ufeff")
    reader = csv.DictReader(io.StringIO(sample))
    return [dict(row) for row in reader]


def assert_cse_http_url(url: str, purpose: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise CseImportError(f"Invalid {purpose} URL")
    if parsed.hostname not in {"www.cse.lk", "cse.lk"}:
        raise CseImportError(f"Only cse.lk URLs are allowed for {purpose}")


def fetch_trade_summary_page_html(source_url: str) -> str:
    headers = {
        "User-Agent": settings.cse_import_user_agent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    with httpx.Client(timeout=settings.cse_import_timeout_seconds, follow_redirects=True, headers=headers) as client:
        response = client.get(source_url)
    if response.status_code != 200:
        raise CseImportFetchError(f"CSE Trade Summary page returned status {response.status_code}")
    return response.text


def discover_csv_download_url(html: str, source_url: str) -> str | None:
    soup = BeautifulSoup(html, "lxml")
    candidates: list[str] = []

    for element in soup.select("a[href], button[data-url], button[data-href], [data-download-url], [data-export-url]"):
        for attr in ["href", "data-url", "data-href", "data-download-url", "data-export-url"]:
            value = element.get(attr)
            if value:
                candidates.append(urljoin(source_url, str(value)))

    script_text = "\n".join(script.get_text(" ", strip=True) for script in soup.select("script"))
    for match in re.finditer(r"https?://[^'\"\s<>]+", script_text):
        candidates.append(match.group(0))
    for match in re.finditer(r"['\"]([^'\"]*(?:csv|download|export)[^'\"]*)['\"]", script_text, re.I):
        candidates.append(urljoin(source_url, match.group(1)))

    seen: set[str] = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        lowered = candidate.lower()
        if any(token in lowered for token in ["csv", "download", "export"]) and "trade" in lowered:
            parsed = urlparse(candidate)
            if parsed.scheme in {"http", "https"} and parsed.hostname in {"www.cse.lk", "cse.lk"}:
                return candidate
    return None


def fetch_trade_summary_csv(source_url: str, csv_url: str | None = None, *, discovery_source: str = "configured") -> tuple[dict[str, Any], list[TradeSummaryRow], list[str]]:
    resolved_csv_url = csv_url or settings.cse_trade_summary_csv_url
    if not resolved_csv_url:
        raise CseImportFetchError("No CSE Trade Summary CSV fallback URL is available")
    assert_cse_http_url(resolved_csv_url, "CSE Trade Summary CSV fallback")
    headers = {
        "User-Agent": settings.cse_import_user_agent,
        "Accept": "text/csv,application/csv,text/plain,*/*",
        "Referer": source_url,
    }
    with httpx.Client(timeout=settings.cse_import_timeout_seconds, follow_redirects=True, headers=headers) as client:
        response = client.get(resolved_csv_url)
    if response.status_code != 200:
        raise CseImportFetchError(f"CSE Trade Summary CSV fallback returned status {response.status_code}")
    records = parse_csv_rows(response.text)
    rows: list[TradeSummaryRow] = []
    warnings: list[str] = []
    for index, record in enumerate(records, start=1):
        row = row_from_record(record)
        if row is None:
            warnings.append(f"Skipped Trade Summary CSV row {index}: missing company name or symbol.")
            continue
        row.raw_row = {**row.raw_row, "sourceEndpoint": resolved_csv_url, "sourceMode": f"csv-{discovery_source}"}
        rows.append(row)
    if not rows:
        raise CseImportParseError("No Trade Summary rows were parsed from the CSE CSV fallback")
    return {"statusCode": response.status_code, "endpoint": resolved_csv_url, "payload": records, "discoverySource": discovery_source}, rows, warnings


def parse_html_table(html: str, source_url: str) -> tuple[dict[str, Any], list[TradeSummaryRow], list[str], str | None]:
    soup = BeautifulSoup(html, "lxml")
    market_text = None
    text = soup.get_text(" ", strip=True)
    match = re.search(r"MARKET STATISTICS AS OF\s+([0-9]{1,2}\s+[A-Z]{3}\s+[0-9]{4},\s+[0-9:]+\s+[AP]M)", text, re.I)
    if match:
        market_text = clean_text(match.group(1))

    table = soup.select_one("table")
    if table is None:
        raise CseImportParseError("CSE Trade Summary HTML fallback did not contain a table")
    headers = [clean_text(th.get_text(" ", strip=True)) for th in table.select("thead th")]
    if not headers:
        first_row = table.select_one("tr")
        headers = [clean_text(cell.get_text(" ", strip=True)) for cell in first_row.select("th,td")] if first_row else []
    rows: list[TradeSummaryRow] = []
    warnings: list[str] = []
    for row_index, tr in enumerate(table.select("tbody tr") or table.select("tr")[1:], start=1):
        cells = [clean_text(td.get_text(" ", strip=True)) for td in tr.select("td")]
        if len(cells) < 2:
            continue
        record = {headers[index] if index < len(headers) and headers[index] else f"column_{index}": cells[index] for index in range(len(cells))}
        css = " ".join(tr.get("class") or [])
        record["rowClass"] = css
        record["isWatchList"] = "highlight" in css.lower() or "watch" in css.lower()
        parsed = row_from_record(record)
        if parsed is None:
            warnings.append(f"Skipped Trade Summary HTML row {row_index}: missing company name or symbol.")
            continue
        parsed.raw_row = {**parsed.raw_row, "sourceEndpoint": source_url, "sourceMode": "html", "rowClass": css}
        rows.append(parsed)
    if not rows:
        raise CseImportParseError("No Trade Summary rows were parsed from the CSE HTML fallback")
    return {"endpoint": source_url, "payload": {"htmlLength": len(html), "marketTimestampText": market_text}}, rows, warnings, market_text


def fetch_trade_summary_html(source_url: str, html: str | None = None) -> tuple[dict[str, Any], list[TradeSummaryRow], list[str], str | None]:
    return parse_html_table(html if html is not None else fetch_trade_summary_page_html(source_url), source_url)


def dedupe_rows(rows: list[TradeSummaryRow]) -> tuple[list[TradeSummaryRow], int, list[str]]:
    by_symbol: dict[str, TradeSummaryRow] = {}
    duplicates: set[str] = set()
    for row in rows:
        if row.normalized_symbol in by_symbol:
            duplicates.add(row.normalized_symbol)
        by_symbol[row.normalized_symbol] = row
    return [by_symbol[key] for key in sorted(by_symbol)], max(len(rows) - len(by_symbol), 0), sorted(duplicates)


def run_trade_summary_import(source_url: str | None = None) -> dict[str, Any]:
    url = source_url or settings.cse_trade_summary_source_url
    assert_trade_summary_source_url(url)
    fetched_at = datetime.now(timezone.utc).isoformat()
    warnings: list[str] = []
    raw_response: dict[str, Any] | None = None
    market_timestamp_text: str | None = None
    fetch_strategy = "api"

    try:
        raw_response, rows, strategy_warnings = fetch_trade_summary_api(url)
        warnings.extend(strategy_warnings)
        market_timestamp_text, _ = market_timestamp_from_payload(raw_response.get("payload"))
    except CseImportError as api_error:
        warnings.append(f"Trade Summary API fetch failed; trying configured CSV fallback. {api_error}")
        page_html: str | None = None
        try:
            raw_response, rows, strategy_warnings = fetch_trade_summary_csv(url, discovery_source="configured")
            fetch_strategy = "csv-configured"
            warnings.extend(strategy_warnings)
        except CseImportError as configured_csv_error:
            warnings.append(f"Configured Trade Summary CSV fallback failed; trying download-link discovery. {configured_csv_error}")
            try:
                page_html = fetch_trade_summary_page_html(url)
                discovered_csv_url = discover_csv_download_url(page_html, url)
                if not discovered_csv_url:
                    raise CseImportFetchError("No CSV/export/download link could be discovered from the Trade Summary page")
                raw_response, rows, strategy_warnings = fetch_trade_summary_csv(url, discovered_csv_url, discovery_source="discovered")
                fetch_strategy = "csv-discovered"
                warnings.extend(strategy_warnings)
            except CseImportError as discovered_csv_error:
                warnings.append(f"Trade Summary CSV discovery fallback failed; trying HTML table fallback. {discovered_csv_error}")
                raw_response, rows, strategy_warnings, market_timestamp_text = fetch_trade_summary_html(url, page_html)
                fetch_strategy = "html"
                warnings.extend(strategy_warnings)

    deduped, records_deduplicated, duplicate_symbols = dedupe_rows(rows)
    if not any(row.watch_list_detection_source for row in deduped):
        warnings.append(
            "Watch List detection source was not exposed by the active Trade Summary fetch strategy; rows defaulted to isWatchList=false unless explicitly highlighted."
        )
    if len(deduped) < settings.cse_trade_summary_min_expected_rows:
        warnings.append(
            f"Trade Summary parsed {len(deduped)} unique rows, below configured minimum {settings.cse_trade_summary_min_expected_rows}."
        )
    checksum_source = json.dumps(raw_response, sort_keys=True, default=str)
    checksum = hashlib.sha256(checksum_source.encode("utf-8")).hexdigest()

    return {
        "status": "success",
        "source": "CSE_TRADE_SUMMARY",
        "sourceUrl": url,
        "fetchMode": "python-http",
        "fetchStrategy": fetch_strategy,
        "apiEndpoint": api_url_from_source(url),
        "csvFallbackUrl": settings.cse_trade_summary_csv_url or None,
        "fetchedAt": fetched_at,
        "marketTimestamp": None,
        "sourceMarketTimestampText": market_timestamp_text,
        "rowCount": len(deduped),
        "recordsBeforeDeduplication": len(rows),
        "recordsDeduplicated": records_deduplicated,
        "duplicateSymbols": duplicate_symbols,
        "checksum": checksum,
        "warnings": warnings,
        "rawResponse": raw_response,
        "rows": [row.to_backend_dict() for row in deduped],
    }
