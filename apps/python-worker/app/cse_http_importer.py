from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import urljoin, urlparse, parse_qs

import httpx
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field, field_validator
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .config import settings


class CseImportError(RuntimeError):
    pass


class CseImportFetchError(CseImportError):
    pass


class CseImportParseError(CseImportError):
    pass


FORBIDDEN_PAGE_VALUES = {
    "DATE_LISTED",
    "DATE LISTED",
    "TYPE_OF_ISSUE",
    "TYPE OF ISSUE",
    "TURNOVER",
    "TRADE_VOLUME",
    "TRADE VOLUME",
    "SHARE_VOLUME",
    "SHARE VOLUME",
    "GAINERS",
    "LOSERS",
}


class CseCompanyRow(BaseModel):
    company_name: str = Field(min_length=1)
    normalized_company_name: str = Field(min_length=1)
    symbol: str = Field(min_length=1)
    normalized_symbol: str = Field(min_length=1)
    board: str | None = None
    sector: str | None = None
    profile_url: str | None = None
    logo_url: str | None = None
    last_traded_price: float | None = None
    trade_volume: int | None = None
    share_volume: int | None = None
    turnover: float | None = None
    market_capitalization: float | None = None
    change_amount: float | None = None
    change_percent: float | None = None
    source_letter: str | None = None
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
            "board": self.board,
            "sector": self.sector,
            "profileUrl": self.profile_url,
            "logoUrl": self.logo_url,
            "lastTradedPrice": self.last_traded_price,
            "tradeVolume": self.trade_volume,
            "shareVolume": self.share_volume,
            "turnover": self.turnover,
            "marketCapitalization": self.market_capitalization,
            "changeAmount": self.change_amount,
            "changePercent": self.change_percent,
            "sourceLetter": self.source_letter,
            "rawRow": self.raw_row,
        }


def assert_alphabetical_source_url(source_url: str) -> None:
    parsed = urlparse(source_url)
    if parsed.scheme not in {"http", "https"}:
        raise CseImportError("Invalid CSE source URL")
    if parsed.hostname not in {"www.cse.lk", "cse.lk"}:
        raise CseImportError("Only cse.lk source URLs are allowed for this importer")
    if "/listed-entities/listed-company-directory" not in parsed.path:
        raise CseImportError("Only CSE listed-company-directory source path is allowed")

    params = parse_qs(parsed.query)
    page = (params.get("page") or [""])[0].strip().upper()
    if page != "ALPHABETICAL":
        raise CseImportError("Only page=ALPHABETICAL is allowed for this importer")

    for values in params.values():
        for value in values:
            if value.strip().upper() in FORBIDDEN_PAGE_VALUES:
                raise CseImportError(f"Forbidden CSE tab/source is not allowed: {value}")


def clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").replace("\xa0", " ")).strip()


def normalize_company_name(value: str) -> str:
    return clean_text(value).upper()


def normalize_symbol(value: str) -> str:
    return re.sub(r"\s+", "", str(value or "")).strip().upper()


def normalize_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", clean_text(value).lower()).strip()


def normalize_number(value: Any) -> float | None:
    if value is None:
        return None
    raw = clean_text(value).replace(",", "").replace("%", "")
    if not raw or raw in {"-", "N/A", "n/a"}:
        return None
    try:
        return float(Decimal(raw.lstrip("+")))
    except (InvalidOperation, ValueError):
        return None


def normalize_int(value: Any) -> int | None:
    parsed = normalize_number(value)
    return int(parsed) if parsed is not None else None


def normalize_signed_percent(change_amount: float | None, change_percent: float | None) -> float | None:
    if change_percent is None:
        return None
    if change_amount is None or change_amount == 0:
        return change_percent
    return -abs(change_percent) if change_amount < 0 else abs(change_percent)


def first_value(record: dict[str, Any], candidates: list[str]) -> Any:
    normalized = {normalize_header(key): value for key, value in record.items()}
    for candidate in candidates:
        if candidate in normalized and clean_text(normalized[candidate]):
            return normalized[candidate]
    return None


def resolve_url(value: str | None, source_url: str) -> str | None:
    cleaned = clean_text(value)
    if not cleaned:
        return None
    return urljoin(source_url, cleaned)


def row_from_record(record: dict[str, Any], source_url: str) -> CseCompanyRow | None:
    company_name = clean_text(first_value(record, ["company name", "companyname", "company", "name"]))
    symbol = normalize_symbol(first_value(record, ["symbol", "security symbol", "code"]))
    if not company_name or not symbol:
        return None

    change_amount = normalize_number(first_value(record, ["change rs", "change amount", "change"]))
    change_percent = normalize_number(
        first_value(record, ["change percent", "change percentage", "change pct", "changepercentage", "percentage change", "percentagechange", "change"])
    )
    profile_url = resolve_url(clean_text(first_value(record, ["profile url", "profile", "href"])), source_url)
    logo_url = resolve_logo_url(clean_text(first_value(record, ["logo url", "logourl", "logo"])), source_url)

    return CseCompanyRow(
        company_name=company_name,
        normalized_company_name=normalize_company_name(company_name),
        symbol=symbol,
        normalized_symbol=symbol,
        board=clean_text(first_value(record, ["board"])) or None,
        sector=clean_text(first_value(record, ["sector"])) or None,
        profile_url=profile_url,
        logo_url=logo_url,
        last_traded_price=normalize_number(first_value(record, ["last traded price rs", "last traded price", "lasttradedprice", "ltp", "price"])),
        trade_volume=normalize_int(first_value(record, ["trade volume", "tradevolume", "trades"])),
        share_volume=normalize_int(first_value(record, ["share volume", "sharevolume", "volume"])),
        turnover=normalize_number(first_value(record, ["turnover rs", "turnover"])),
        market_capitalization=normalize_number(first_value(record, ["market capitalization", "marketcapitalization", "market cap", "market capitalisation"])),
        change_amount=change_amount,
        change_percent=normalize_signed_percent(change_amount, change_percent),
        source_letter=symbol[:1] if symbol else None,
        raw_row=record,
    )


def parse_table(table: Any, source_url: str) -> list[CseCompanyRow]:
    headers = [normalize_header(cell.get_text(" ", strip=True)) for cell in table.select("thead th")]
    rows: list[CseCompanyRow] = []

    for tr in table.select("tbody tr, tr"):
        cells = tr.find_all("td")
        if len(cells) < 2:
            continue

        if headers and len(headers) >= len(cells):
            record = {headers[index]: cells[index].get_text(" ", strip=True) for index in range(len(cells))}
        else:
            positional = [
                "company name",
                "symbol",
                "last traded price",
                "trade volume",
                "share volume",
                "turnover",
                "change amount",
                "change percent",
            ]
            record = {positional[index]: cells[index].get_text(" ", strip=True) for index in range(min(len(cells), len(positional)))}

        company_link = cells[0].find("a", href=True)
        if company_link:
            record["href"] = company_link["href"]
        row = row_from_record(record, source_url)
        if row:
            rows.append(row)

    return rows


def walk_json(value: Any) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    if isinstance(value, dict):
        normalized_keys = {normalize_header(key) for key in value.keys()}
        if {"company name", "symbol"}.issubset(normalized_keys) or {"company", "symbol"}.issubset(normalized_keys):
            records.append(value)
        for child in value.values():
            records.extend(walk_json(child))
    elif isinstance(value, list):
        for child in value:
            records.extend(walk_json(child))
    return records


def parse_embedded_json(soup: BeautifulSoup, source_url: str) -> list[CseCompanyRow]:
    rows: list[CseCompanyRow] = []
    for script in soup.find_all("script"):
        text = script.string or script.get_text()
        if not text or "symbol" not in text.lower():
            continue
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            continue
        for record in walk_json(payload):
            row = row_from_record(record, source_url)
            if row:
                rows.append(row)
    return rows


def dedupe_rows(rows: list[CseCompanyRow]) -> list[CseCompanyRow]:
    by_symbol: dict[str, CseCompanyRow] = {}
    for row in rows:
        by_symbol[row.normalized_symbol] = row
    return [by_symbol[key] for key in sorted(by_symbol)]


def parse_alphabetical_html(html: str, source_url: str | None = None) -> list[CseCompanyRow]:
    if not clean_text(html):
        raise CseImportParseError("CSE listed-company directory response body is empty")

    source = source_url or settings.cse_listed_company_directory_url
    soup = BeautifulSoup(html, "lxml")
    rows: list[CseCompanyRow] = []
    for table in soup.find_all("table"):
        rows.extend(parse_table(table, source))
    rows.extend(parse_embedded_json(soup, source))
    deduped = dedupe_rows(rows)
    if not deduped:
        raise CseImportParseError("No listed-company rows were parsed from the CSE ALPHABETICAL directory HTML")
    return deduped


def resolve_logo_url(value: str | None, source_url: str) -> str | None:
    cleaned = clean_text(value)
    if not cleaned:
        return None
    if cleaned.startswith("upload_logo/"):
        return f"https://cdn.cse.lk/cmt/{cleaned}"
    return resolve_url(cleaned, source_url)


@retry(
    retry=retry_if_exception_type((httpx.TimeoutException, httpx.TransportError, CseImportFetchError)),
    stop=stop_after_attempt(settings.cse_import_max_retries),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    reraise=True,
)
def fetch_html(source_url: str) -> str:
    headers = {
        "User-Agent": settings.cse_import_user_agent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    try:
        with httpx.Client(timeout=settings.cse_import_timeout_seconds, follow_redirects=True, headers=headers) as client:
            response = client.get(source_url)
    except (httpx.TimeoutException, httpx.TransportError) as exc:
        raise CseImportFetchError(f"CSE HTTP fetch failed: {exc}") from exc

    if response.status_code != 200:
        raise CseImportFetchError(f"CSE HTTP fetch returned status {response.status_code}")
    if not response.text.strip():
        raise CseImportFetchError("CSE HTTP fetch returned an empty response body")
    return response.text


def alphabetical_api_url(source_url: str) -> str:
    parsed = urlparse(source_url)
    return f"{parsed.scheme}://{parsed.netloc}/api/alphabetical"


@retry(
    retry=retry_if_exception_type((httpx.TimeoutException, httpx.TransportError, CseImportFetchError)),
    stop=stop_after_attempt(settings.cse_import_max_retries),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    reraise=True,
)
def fetch_alphabetical_api_rows(source_url: str) -> tuple[list[CseCompanyRow], list[str], str]:
    api_url = alphabetical_api_url(source_url)
    headers = {
        "User-Agent": settings.cse_import_user_agent,
        "Accept": "application/json",
        "Referer": source_url,
    }
    rows: list[CseCompanyRow] = []
    warnings: list[str] = []
    response_bodies: list[dict[str, Any]] = []

    try:
        with httpx.Client(timeout=settings.cse_import_timeout_seconds, follow_redirects=True, headers=headers) as client:
            for codepoint in range(ord("A"), ord("Z") + 1):
                letter = chr(codepoint)
                response = client.post(api_url, data={"alphabet": letter})
                if response.status_code != 200:
                    warnings.append(f"CSE ALPHABETICAL API {letter} returned status {response.status_code}.")
                    continue
                payload = response.json()
                response_bodies.append({"letter": letter, "payload": payload})
                records = payload.get("reqAlphabetical") or payload.get("data") or []
                if not isinstance(records, list):
                    warnings.append(f"CSE ALPHABETICAL API {letter} returned an unexpected payload shape.")
                    continue
                for record in records:
                    if not isinstance(record, dict):
                        continue
                    row = row_from_record({**record, "sourceLetter": letter}, source_url)
                    if row:
                        row.source_letter = letter
                        row.raw_row = {**row.raw_row, "sourceLetter": letter, "sourceEndpoint": api_url}
                        rows.append(row)
    except (httpx.TimeoutException, httpx.TransportError) as exc:
        raise CseImportFetchError(f"CSE ALPHABETICAL API fetch failed: {exc}") from exc
    except ValueError as exc:
        raise CseImportParseError(f"CSE ALPHABETICAL API returned invalid JSON: {exc}") from exc

    deduped = dedupe_rows(rows)
    if not deduped:
        raise CseImportParseError("No listed-company rows were parsed from the CSE ALPHABETICAL API")
    return deduped, warnings, json.dumps(response_bodies, sort_keys=True, default=str)


def run_http_import(source_url: str | None = None) -> dict[str, Any]:
    url = source_url or settings.cse_listed_company_directory_url
    assert_alphabetical_source_url(url)
    fetched_at = datetime.now(timezone.utc).isoformat()
    html = fetch_html(url)
    warnings: list[str] = []
    try:
        rows = parse_alphabetical_html(html, url)
        checksum_source = html
    except CseImportParseError as exc:
        warnings.append(f"HTML shell did not contain parseable rows; using same-directory ALPHABETICAL JSON endpoint: {exc}")
        rows, api_warnings, api_content = fetch_alphabetical_api_rows(url)
        warnings.extend(api_warnings)
        checksum_source = html + api_content
    checksum = hashlib.sha256(checksum_source.encode("utf-8")).hexdigest()

    return {
        "status": "success",
        "source": "CSE_LISTED_COMPANY_DIRECTORY_ALPHABETICAL",
        "sourceUrl": url,
        "fetchMode": "python-http",
        "fetchedAt": fetched_at,
        "rowCount": len(rows),
        "recordsBeforeDeduplication": len(rows),
        "recordsDeduplicated": 0,
        "checksum": checksum,
        "warnings": warnings,
        "rows": [row.to_backend_dict() for row in rows],
    }
