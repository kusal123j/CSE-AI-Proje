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


def find_duplicate_symbols(rows: list[CseCompanyRow]) -> list[str]:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for row in rows:
        symbol = row.normalized_symbol
        if symbol in seen:
            duplicates.add(symbol)
        seen.add(symbol)
    return sorted(duplicates)


def dedupe_rows_with_count(rows: list[CseCompanyRow]) -> tuple[list[CseCompanyRow], int, list[str]]:
    by_symbol: dict[str, CseCompanyRow] = {}
    for row in rows:
        by_symbol[row.normalized_symbol] = row
    duplicates = find_duplicate_symbols(rows)
    return [by_symbol[key] for key in sorted(by_symbol)], max(len(rows) - len(by_symbol), 0), duplicates


def _letter_failure(letter: str, attempts: int, message: str, status_code: int | None = None, raw_text: str | None = None) -> tuple[dict[str, Any], dict[str, Any], list[CseCompanyRow], list[str]]:
    raw: dict[str, Any] = {"letter": letter, "statusCode": status_code, "error": message, "attempts": attempts}
    if raw_text is not None:
        raw["rawText"] = raw_text
    result = {"letter": letter, "status": "failed", "rowCount": 0, "attempts": attempts, "error": message, "lastError": message}
    return raw, result, [], [message]


def fetch_one_alphabetical_letter(client: httpx.Client, api_url: str, source_url: str, letter: str) -> tuple[dict[str, Any], dict[str, Any], list[CseCompanyRow], list[str]]:
    max_attempts = max(settings.cse_import_retry_count, 1)
    warnings: list[str] = []
    last_error = "Unknown letter fetch error"

    for attempt in range(1, max_attempts + 1):
        try:
            response = client.post(api_url, data={"alphabet": letter})
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            last_error = f"CSE ALPHABETICAL API {letter} fetch failed: {exc}"
            if attempt < max_attempts:
                warnings.append(f"{last_error}; retrying attempt {attempt + 1}/{max_attempts}.")
                continue
            return _letter_failure(letter, attempt, last_error)

        raw_text = response.text
        if response.status_code == 429 or response.status_code >= 500:
            last_error = f"CSE ALPHABETICAL API {letter} returned transient status {response.status_code}."
            if attempt < max_attempts:
                warnings.append(f"{last_error}; retrying attempt {attempt + 1}/{max_attempts}.")
                continue
            return _letter_failure(letter, attempt, last_error, response.status_code, raw_text)

        if response.status_code != 200:
            last_error = f"CSE ALPHABETICAL API {letter} returned status {response.status_code}."
            return _letter_failure(letter, attempt, last_error, response.status_code, raw_text)

        try:
            payload = response.json()
        except ValueError as exc:
            last_error = f"CSE ALPHABETICAL API {letter} returned invalid JSON: {exc}"
            if attempt < max_attempts:
                warnings.append(f"{last_error}; retrying attempt {attempt + 1}/{max_attempts}.")
                continue
            return _letter_failure(letter, attempt, last_error, response.status_code, raw_text)

        records = payload.get("reqAlphabetical") or payload.get("data") or payload.get("rows") or []
        if not isinstance(records, list):
            last_error = f"CSE ALPHABETICAL API {letter} returned an unexpected payload shape."
            return _letter_failure(letter, attempt, last_error, response.status_code, raw_text)

        letter_rows: list[CseCompanyRow] = []
        for record in records:
            if not isinstance(record, dict):
                continue
            row = row_from_record({**record, "sourceLetter": letter}, source_url)
            if row:
                row.source_letter = letter
                row.raw_row = {**row.raw_row, "sourceLetter": letter, "sourceEndpoint": api_url}
                letter_rows.append(row)

        status = "success" if letter_rows else "empty"
        raw = {"letter": letter, "statusCode": response.status_code, "payload": payload, "attempts": attempt}
        result = {"letter": letter, "status": status, "rowCount": len(letter_rows), "attempts": attempt, "lastError": None}
        return raw, result, letter_rows, warnings

    return _letter_failure(letter, max_attempts, last_error)


def fetch_alphabetical_api_rows(source_url: str) -> tuple[list[CseCompanyRow], list[str], list[dict[str, Any]], list[dict[str, Any]], int, list[str]]:
    api_url = alphabetical_api_url(source_url)
    headers = {
        "User-Agent": settings.cse_import_user_agent,
        "Accept": "application/json",
        "Referer": source_url,
    }
    rows_before_deduplication: list[CseCompanyRow] = []
    warnings: list[str] = []
    response_bodies: list[dict[str, Any]] = []
    letter_results: list[dict[str, Any]] = []

    try:
        with httpx.Client(timeout=settings.cse_import_letter_timeout_seconds, follow_redirects=True, headers=headers) as client:
            for codepoint in range(ord("A"), ord("Z") + 1):
                letter = chr(codepoint)
                raw, result, letter_rows, letter_warnings = fetch_one_alphabetical_letter(client, api_url, source_url, letter)
                warnings.extend(letter_warnings)
                if result.get("status") == "failed" and result.get("error"):
                    warnings.append(str(result["error"]))
                response_bodies.append(raw)
                letter_results.append(result)
                rows_before_deduplication.extend(letter_rows)
    except (httpx.TimeoutException, httpx.TransportError) as exc:
        raise CseImportFetchError(f"CSE ALPHABETICAL API fetch failed: {exc}") from exc

    deduped, deduped_count, duplicate_symbols = dedupe_rows_with_count(rows_before_deduplication)
    if not deduped:
        raise CseImportParseError("No listed-company rows were parsed from the CSE ALPHABETICAL API")
    return deduped, warnings, response_bodies, letter_results, deduped_count, duplicate_symbols

def run_http_import(source_url: str | None = None) -> dict[str, Any]:
    url = source_url or settings.cse_listed_company_directory_url
    assert_alphabetical_source_url(url)
    fetched_at = datetime.now(timezone.utc).isoformat()
    warnings: list[str] = []

    rows, api_warnings, raw_letter_responses, letter_results, records_deduplicated, duplicate_symbols = fetch_alphabetical_api_rows(url)
    warnings.extend(api_warnings)

    checksum_source = json.dumps(raw_letter_responses, sort_keys=True, default=str)
    checksum = hashlib.sha256(checksum_source.encode("utf-8")).hexdigest()
    letters_attempted = len(letter_results)
    letters_successful = len([item for item in letter_results if item.get("status") in {"success", "empty"}])
    letters_failed = len([item for item in letter_results if item.get("status") == "failed"])
    failed_letters = [
        {"letter": str(item.get("letter")), "error": str(item.get("error") or "Unknown letter fetch error"), "attempts": int(item.get("attempts") or 1)}
        for item in letter_results
        if item.get("status") == "failed"
    ]
    raw_row_count = len(rows) + records_deduplicated

    return {
        "status": "success",
        "source": "CSE_LISTED_COMPANY_DIRECTORY_ALPHABETICAL",
        "sourceUrl": url,
        "fetchMode": "python-http",
        "fetchGranularity": "A_Z_LETTER_BY_LETTER",
        "fullExportSupported": False,
        "browserAutomationEnabled": False,
        "fetchedAt": fetched_at,
        "rowCount": len(rows),
        "recordsBeforeDeduplication": raw_row_count,
        "recordsDeduplicated": records_deduplicated,
        "duplicateSymbols": duplicate_symbols,
        "checksum": checksum,
        "warnings": warnings,
        "lettersAttempted": letters_attempted,
        "lettersSuccessful": letters_successful,
        "lettersFailed": letters_failed,
        "failedLetters": failed_letters,
        "letterResults": letter_results,
        "rawLetterResponses": raw_letter_responses,
        "rows": [row.to_backend_dict() for row in rows],
    }
