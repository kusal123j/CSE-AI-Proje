from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import quote, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup, Tag
from pydantic import BaseModel, Field, field_validator
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .config import settings
from .cse_http_importer import CseImportError, CseImportFetchError, clean_text, normalize_symbol


class GicsImportError(CseImportError):
    pass


class GicsFetchError(CseImportFetchError):
    pass


class GicsParseError(GicsImportError):
    pass


ALLOWED_GICS_PATHS = {
    "/equity/gics-industry-group-summary",
    "/equity/gics-industry-group-indices",
    "/listed-entities/gics-classification",
}

DEFAULT_INDUSTRY_GROUPS = [
    "Energy",
    "Materials",
    "Capital Goods",
    "Commercial & Professional Services",
    "Transportation",
    "Automobiles & Components",
    "Consumer Durables & Apparel",
    "Consumer Services",
    "Retailing",
    "Food & Staples Retailing",
    "Food, Beverage & Tobacco",
    "Household & Personal Products",
    "Health Care Equipment & Services",
    "Banks",
    "Diversified Financials",
    "Insurance",
    "Software & Services",
    "Telecommunication Services",
    "Utilities",
    "Real Estate Management&Development",
]


class GicsIndustryGroupRow(BaseModel):
    industry_group_code: str = Field(min_length=1)
    gics_code: str = Field(min_length=1)
    symbol: str = Field(min_length=1)
    industry_group_name: str = Field(min_length=1)
    raw_row: dict[str, Any] = Field(default_factory=dict)

    def to_backend_dict(self) -> dict[str, Any]:
        return {
            "industryGroupCode": self.industry_group_code,
            "gicsCode": self.gics_code,
            "symbol": self.symbol,
            "industryGroupName": self.industry_group_name,
            "rawRow": self.raw_row,
        }


class GicsSummaryRow(BaseModel):
    industry_group_code: str = Field(min_length=1)
    index_code: str = Field(min_length=1)
    index_value: float | None = None
    turnover_value: float | None = None
    turnover_volume: int | None = None
    trade_volume: int | None = None
    per: float | None = None
    pbv: float | None = None
    dy: float | None = None
    companies_traded: int | None = None
    companies_listed: int | None = None
    raw_row: dict[str, Any] = Field(default_factory=dict)

    def to_backend_dict(self) -> dict[str, Any]:
        return {
            "industryGroupCode": self.industry_group_code,
            "indexCode": self.index_code,
            "indexValue": self.index_value,
            "turnoverValue": self.turnover_value,
            "turnoverVolume": self.turnover_volume,
            "tradeVolume": self.trade_volume,
            "per": self.per,
            "pbv": self.pbv,
            "dy": self.dy,
            "companiesTraded": self.companies_traded,
            "companiesListed": self.companies_listed,
            "rawRow": self.raw_row,
        }


class GicsIndexRow(BaseModel):
    industry_group_name: str = Field(min_length=1)
    index_code: str = Field(min_length=1)
    gics_code: str = Field(min_length=1)
    today_index: float | None = None
    previous_index: float | None = None
    index_change: float | None = None
    index_change_percent: float | None = None
    turnover_value: float | None = None
    turnover_volume: int | None = None
    trades: int | None = None
    raw_row: dict[str, Any] = Field(default_factory=dict)

    def to_backend_dict(self) -> dict[str, Any]:
        return {
            "industryGroupName": self.industry_group_name,
            "indexCode": self.index_code,
            "gicsCode": self.gics_code,
            "todayIndex": self.today_index,
            "previousIndex": self.previous_index,
            "indexChange": self.index_change,
            "indexChangePercent": self.index_change_percent,
            "turnoverValue": self.turnover_value,
            "turnoverVolume": self.turnover_volume,
            "trades": self.trades,
            "rawRow": self.raw_row,
        }


class GicsClassificationRow(BaseModel):
    company_name: str = Field(min_length=1)
    normalized_company_name: str = Field(min_length=1)
    symbol: str = Field(min_length=1)
    normalized_symbol: str = Field(min_length=1)
    industry_group_name: str = Field(min_length=1)
    last_traded_time: str | None = None
    last_traded_price: float | None = None
    trade_volume: int | None = None
    share_volume: int | None = None
    turnover: float | None = None
    change_amount: float | None = None
    change_percent: float | None = None
    ytd_change_percent: float | None = None
    raw_row: dict[str, Any] = Field(default_factory=dict)

    @field_validator("symbol", "normalized_symbol")
    @classmethod
    def validate_symbol(cls, value: str) -> str:
        normalized = normalize_symbol(value)
        if not normalized:
            raise ValueError("symbol is required")
        return normalized

    def to_backend_dict(self) -> dict[str, Any]:
        return {
            "companyName": self.company_name,
            "normalizedCompanyName": self.normalized_company_name,
            "symbol": self.symbol,
            "normalizedSymbol": self.normalized_symbol,
            "industryGroupName": self.industry_group_name,
            "lastTradedTime": self.last_traded_time,
            "lastTradedPrice": self.last_traded_price,
            "tradeVolume": self.trade_volume,
            "shareVolume": self.share_volume,
            "turnover": self.turnover,
            "changeAmount": self.change_amount,
            "changePercent": self.change_percent,
            "ytdChangePercent": self.ytd_change_percent,
            "rawRow": self.raw_row,
        }


def assert_gics_source_url(source_url: str, expected_path: str | None = None) -> None:
    parsed = urlparse(source_url)
    if parsed.scheme not in {"http", "https"}:
        raise GicsImportError("Invalid CSE GICS source URL")
    if parsed.hostname not in {"www.cse.lk", "cse.lk"}:
        raise GicsImportError("Only cse.lk URLs are allowed for the GICS importer")
    if expected_path and expected_path not in parsed.path:
        raise GicsImportError(f"Only the CSE {expected_path} source path is allowed for this GICS importer")
    if expected_path is None and not any(path in parsed.path for path in ALLOWED_GICS_PATHS):
        raise GicsImportError("Only official CSE GICS source paths are allowed")


def normalize_header(value: str) -> str:
    normalized = clean_text(value).replace("\xa0", " ").lower()
    normalized = re.sub(r"\((.*?)\)", r" \1 ", normalized)
    normalized = normalized.replace("%", " percent ").replace("&", " and ")
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized).strip()
    return normalized


def normalize_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", normalize_header(value))


def parse_decimal(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float, Decimal)):
        return float(value)
    text = clean_text(str(value)).replace(",", "").replace("%", "").replace("+", "")
    text = re.sub(r"[^0-9.\-]", "", text)
    if text in {"", "-", ".", "-."}:
        return None
    try:
        return float(Decimal(text))
    except (InvalidOperation, ValueError):
        return None


def parse_int(value: Any) -> int | None:
    parsed = parse_decimal(value)
    return int(parsed) if parsed is not None else None


def first_value(record: dict[str, Any], aliases: list[str]) -> Any:
    normalized_map = {normalize_key(key): value for key, value in record.items()}
    for alias in aliases:
        key = normalize_key(alias)
        if key in normalized_map and clean_text(normalized_map[key]):
            return normalized_map[key]
    return None


def cell_text(cell: Tag) -> str:
    return clean_text(cell.get_text(" ", strip=True))


def _expand_cells(cells: list[Tag]) -> list[str]:
    expanded: list[str] = []
    for cell in cells:
        value = cell_text(cell)
        colspan = 1
        try:
            colspan = max(1, int(cell.get("colspan") or 1))
        except ValueError:
            colspan = 1
        expanded.extend([value] * colspan)
    return expanded


def _unique_headers(headers: list[str]) -> list[str]:
    result: list[str] = []
    counts: dict[str, int] = {}
    for index, header in enumerate(headers):
        base = normalize_header(header) or f"column {index + 1}"
        counts[base] = counts.get(base, 0) + 1
        result.append(base if counts[base] == 1 else f"{base} {counts[base]}")
    return result


def _header_rows_for_table(table: Tag) -> list[Tag]:
    thead = table.find("thead")
    if thead:
        rows = [row for row in thead.find_all("tr", recursive=False) if row.find_all("th")]
        if rows:
            return rows
    # Fallback for simple CSV-like HTML without <thead>: use the first row that has th cells.
    for row in table.find_all("tr"):
        if row.find_all("th"):
            return [row]
    return table.find_all("tr")[:1]


def _data_rows_for_table(table: Tag, header_rows: list[Tag]) -> list[Tag]:
    tbody = table.find("tbody")
    if tbody:
        return [row for row in tbody.find_all("tr", recursive=False) if row.find_all(["td", "th"])]
    skip_ids = {id(row) for row in header_rows}
    return [row for row in table.find_all("tr") if id(row) not in skip_ids and row.find_all(["td", "th"])]


def _best_header_for_table(header_rows: list[Tag]) -> list[str]:
    # CSE index table has a grouping row (PRICE INDEX / TURNOVER) followed by the true column row.
    # CSE summary/classification tables have a single true header row. Never inspect tbody rows as headers.
    candidates: list[list[str]] = []
    for row in header_rows:
        cells = row.find_all(["th", "td"], recursive=False)
        labels = [label for label in _expand_cells(cells) if normalize_header(label) and normalize_header(label) != "nbsp"]
        if len(labels) >= 2:
            candidates.append(labels)
    if not candidates:
        return []
    return _unique_headers(candidates[-1])


def parse_html_tables(html: str) -> list[list[dict[str, str]]]:
    soup = BeautifulSoup(html, "lxml")
    parsed_tables: list[list[dict[str, str]]] = []
    for table in soup.find_all("table"):
        header_rows = _header_rows_for_table(table)
        headers = _best_header_for_table(header_rows)
        if not headers:
            continue
        rows: list[dict[str, str]] = []
        for tr in _data_rows_for_table(table, header_rows):
            cells = tr.find_all(["td", "th"], recursive=False)
            values = _expand_cells(cells)
            values = [clean_text(value) for value in values]
            if not any(values):
                continue
            # If table body has more cells than the final header row because the first header row used colspan,
            # use the rightmost values only for safety. This keeps the CSE multi-row index table aligned.
            if len(values) > len(headers):
                values = values[-len(headers):]
            record = {headers[index]: values[index] if index < len(values) else "" for index in range(len(headers))}
            if any(record.values()):
                rows.append(record)
        if rows:
            parsed_tables.append(rows)
    return parsed_tables


def row_looks_like_summary(record: dict[str, str]) -> bool:
    keys = {normalize_key(key) for key in record.keys()}
    return "gig" in keys and ("turnovervalue" in keys or "companieslisted" in keys)


def row_looks_like_group_mapping(record: dict[str, str]) -> bool:
    keys = {normalize_key(key) for key in record.keys()}
    return "industrygroupcode" in keys and "gicscode" in keys and "industrygroupname" in keys


def row_looks_like_index(record: dict[str, str]) -> bool:
    keys = {normalize_key(key) for key in record.keys()}
    return "industrygroupname" in keys and "indexcode" in keys and "gicscode" in keys and ("today" in keys or "previous" in keys)


def row_looks_like_classification(record: dict[str, str]) -> bool:
    keys = {normalize_key(key) for key in record.keys()}
    return "companyname" in keys and "symbol" in keys and (
        "lasttradedpricers" in keys or "lasttradedprice" in keys or "turnoverrs" in keys or "turnover" in keys
    )


def parse_summary_metric_table(html: str) -> list[GicsSummaryRow]:
    rows: list[GicsSummaryRow] = []
    for table in parse_html_tables(html):
        if not table or not row_looks_like_summary(table[0]):
            continue
        for record in table:
            gig = clean_text(first_value(record, ["gig", "index code", "industry group code"]))
            if not gig:
                continue
            rows.append(
                GicsSummaryRow(
                    industry_group_code=gig,
                    index_code=gig,
                    index_value=parse_decimal(first_value(record, ["index"])),
                    turnover_value=parse_decimal(first_value(record, ["turnover value"])),
                    turnover_volume=parse_int(first_value(record, ["turnover volume"])),
                    trade_volume=parse_int(first_value(record, ["trade volume"])),
                    per=parse_decimal(first_value(record, ["per"])),
                    pbv=parse_decimal(first_value(record, ["pbv"])),
                    dy=parse_decimal(first_value(record, ["dy"])),
                    companies_traded=parse_int(first_value(record, ["companies traded"])),
                    companies_listed=parse_int(first_value(record, ["companies listed"])),
                    raw_row=record,
                )
            )
    return rows


def parse_summary_group_mapping_table(html: str) -> list[GicsIndustryGroupRow]:
    groups: list[GicsIndustryGroupRow] = []
    for table in parse_html_tables(html):
        if not table or not row_looks_like_group_mapping(table[0]):
            continue
        for record in table:
            code = clean_text(first_value(record, ["industry group code"]))
            gics_code = clean_text(first_value(record, ["gics code"])).replace(",", "").replace(".00", "")
            symbol = clean_text(first_value(record, ["symbol"]))
            name = clean_text(first_value(record, ["industry group name"]))
            if code and gics_code and symbol and name:
                groups.append(
                    GicsIndustryGroupRow(
                        industry_group_code=code,
                        gics_code=gics_code,
                        symbol=symbol,
                        industry_group_name=name,
                        raw_row=record,
                    )
                )
    return groups


def parse_summary_table(html: str) -> tuple[list[GicsSummaryRow], list[GicsIndustryGroupRow]]:
    return parse_summary_metric_table(html), parse_summary_group_mapping_table(html)


def parse_indices_table(html: str) -> list[GicsIndexRow]:
    rows: list[GicsIndexRow] = []
    for table in parse_html_tables(html):
        if not table or not row_looks_like_index(table[0]):
            continue
        for record in table:
            name = clean_text(first_value(record, ["industry group name"]))
            index_code = clean_text(first_value(record, ["index code"]))
            gics_code = clean_text(first_value(record, ["gics code"])).replace(",", "").replace(".00", "")
            if not name or not index_code or not gics_code:
                continue
            today = parse_decimal(first_value(record, ["today", "price index today"]))
            previous = parse_decimal(first_value(record, ["previous", "price index previous"]))
            index_change = (today - previous) if today is not None and previous is not None else None
            index_change_percent = ((index_change / previous) * 100) if index_change is not None and previous not in {None, 0} else None
            rows.append(
                GicsIndexRow(
                    industry_group_name=name,
                    index_code=index_code,
                    gics_code=gics_code,
                    today_index=today,
                    previous_index=previous,
                    index_change=index_change,
                    index_change_percent=index_change_percent,
                    turnover_value=parse_decimal(first_value(record, ["value", "turnover value"])),
                    turnover_volume=parse_int(first_value(record, ["volume", "turnover volume"])),
                    trades=parse_int(first_value(record, ["trades"])),
                    raw_row=record,
                )
            )
    return rows


def parse_classification_table(html: str, industry_group_name: str | None = None) -> list[GicsClassificationRow]:
    rows: list[GicsClassificationRow] = []
    detected_group = industry_group_name or detect_selected_group(html) or "Unknown"
    for table in parse_html_tables(html):
        if not table or not row_looks_like_classification(table[0]):
            continue
        for record in table:
            company_name = clean_text(first_value(record, ["company name", "company", "name"]))
            symbol = normalize_symbol(first_value(record, ["symbol"]))
            if not company_name or not symbol:
                continue
            change_amount = parse_decimal(first_value(record, ["change rs", "change amount"] ))
            change_percent = parse_decimal(first_value(record, ["change percent", "change percentage", "change"] ))
            if change_amount is not None and change_amount < 0 and change_percent is not None:
                change_percent = -abs(change_percent)
            rows.append(
                GicsClassificationRow(
                    company_name=company_name,
                    normalized_company_name=company_name.upper(),
                    symbol=symbol,
                    normalized_symbol=symbol,
                    industry_group_name=detected_group,
                    last_traded_time=clean_text(first_value(record, ["last traded time"])) or None,
                    last_traded_price=parse_decimal(first_value(record, ["last traded price rs", "last traded price", "price"])),
                    trade_volume=parse_int(first_value(record, ["trade volume"])),
                    share_volume=parse_int(first_value(record, ["share volume"])),
                    turnover=parse_decimal(first_value(record, ["turnover rs", "turnover"])),
                    change_amount=change_amount,
                    change_percent=change_percent,
                    ytd_change_percent=parse_decimal(first_value(record, ["ytd change percent", "ytd sector price change", "ytd change"])),
                    raw_row={**record, "industryGroupName": detected_group},
                )
            )
    return rows


def detect_selected_group(html: str) -> str | None:
    soup = BeautifulSoup(html, "lxml")
    # Prefer visible selector button value next to the GICS INDUSTRY GROUPS label.
    label = soup.find(string=re.compile("GICS INDUSTRY GROUPS", re.I))
    if label:
        container = label.find_parent()
        for _ in range(4):
            if not container:
                break
            text = clean_text(container.get_text(" ", strip=True))
            for group in DEFAULT_INDUSTRY_GROUPS:
                if re.search(rf"\b{re.escape(group)}\b", text):
                    return group
            container = container.find_parent()
    for group in DEFAULT_INDUSTRY_GROUPS:
        if f">{group}<" in html or group in html[:10000]:
            return group
    return None


def discover_industry_groups(summary_groups: list[GicsIndustryGroupRow], classification_html: str) -> list[str]:
    names = [row.industry_group_name for row in summary_groups]
    if not names:
        soup = BeautifulSoup(classification_html, "lxml")
        visible_text = clean_text(soup.get_text(" ", strip=True))
        names = [group for group in DEFAULT_INDUSTRY_GROUPS if group in visible_text]
    if not names:
        names = DEFAULT_INDUSTRY_GROUPS
    seen: set[str] = set()
    result: list[str] = []
    for name in names:
        cleaned = clean_text(name)
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            result.append(cleaned)
    return result


def discover_download_candidates(base_url: str, html: str) -> list[str]:
    soup = BeautifulSoup(html, "lxml")
    parsed = urlparse(base_url)
    root = f"{parsed.scheme}://{parsed.netloc}"
    candidates: list[str] = []
    patterns = re.compile(r"(csv|download|export|excel|xlsx|gics)", re.I)
    for tag in soup.find_all(["a", "form", "button", "script", "link"]):
        for attr in ("href", "action", "src", "data-url", "data-href", "data-download-url", "data-export-url"):
            value = tag.get(attr)
            if value and patterns.search(value):
                candidates.append(urljoin(base_url, value))
        text = tag.get_text(" ", strip=True)
        for match in re.findall(r"https?://[^\"'<>\s]+", text):
            if patterns.search(match):
                candidates.append(match)
        for match in re.findall(r"/[A-Za-z0-9_./?=&%:-]*(?:csv|download|export|gics)[A-Za-z0-9_./?=&%:-]*", text, flags=re.I):
            candidates.append(urljoin(root, match))
    return list(dict.fromkeys(candidates))


def build_possible_classification_urls(base_url: str, industry_group_name: str) -> list[str]:
    encoded = quote(industry_group_name)
    parsed = urlparse(base_url)
    root = f"{parsed.scheme}://{parsed.netloc}"
    candidates = [
        f"{base_url}?industryGroup={encoded}&entries=all",
        f"{base_url}?industry_group={encoded}&entries=all",
        f"{base_url}?industryGroupName={encoded}&entries=all",
        f"{base_url}?gicsIndustryGroup={encoded}&entries=all",
        f"{base_url}?group={encoded}&entries=all",
        f"{root}/api/gicsClassification?industryGroup={encoded}&entries=all",
        f"{root}/api/gics-classification?industryGroup={encoded}&entries=all",
        f"{root}/api/listedEntities/gicsClassification?industryGroup={encoded}&entries=all",
        f"{root}/api/listed-entities/gics-classification?industryGroup={encoded}&entries=all",
    ]
    return list(dict.fromkeys(candidates))


def checksum_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


@retry(retry=retry_if_exception_type(httpx.HTTPError), stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8), reraise=True)
def fetch_text(source_url: str, timeout_seconds: int | None = None) -> str:
    headers = {"User-Agent": settings.cse_import_user_agent, "Accept": "text/html,application/json,text/csv,*/*"}
    with httpx.Client(timeout=timeout_seconds or settings.cse_gics_timeout_seconds, follow_redirects=True, headers=headers) as client:
        response = client.get(source_url)
        response.raise_for_status()
        return response.text


def rows_from_csv(text: str) -> list[dict[str, str]]:
    sample = text.lstrip("\ufeff")
    reader = csv.DictReader(io.StringIO(sample))
    return [{clean_text(key): clean_text(value) for key, value in row.items() if key is not None} for row in reader]


def parse_possible_json_table(value: Any) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    if isinstance(value, dict):
        keys = {normalize_key(key) for key in value.keys()}
        if (
            {"symbol", "companyname"}.issubset(keys)
            or {"industrygroupname", "indexcode"}.issubset(keys)
            or {"industrygroupcode", "gicscode"}.issubset(keys)
        ):
            records.append(value)
        for child in value.values():
            records.extend(parse_possible_json_table(child))
    elif isinstance(value, list):
        for child in value:
            records.extend(parse_possible_json_table(child))
    return records


def _classification_rows_from_records(records: list[dict[str, Any]], industry_group_name: str) -> list[GicsClassificationRow]:
    rows: list[GicsClassificationRow] = []
    for record in records:
        company = clean_text(first_value(record, ["companyName", "company_name", "company", "name"]))
        symbol = normalize_symbol(first_value(record, ["symbol", "securitySymbol", "security_symbol"]))
        if not company or not symbol:
            continue
        rows.append(
            GicsClassificationRow(
                company_name=company,
                normalized_company_name=company.upper(),
                symbol=symbol,
                normalized_symbol=symbol,
                industry_group_name=industry_group_name,
                last_traded_time=clean_text(first_value(record, ["lastTradedTime", "last_traded_time", "last traded time"])) or None,
                last_traded_price=parse_decimal(first_value(record, ["lastTradedPrice", "last_traded_price", "last traded price", "last"])),
                trade_volume=parse_int(first_value(record, ["tradeVolume", "trade_volume", "trade volume", "trades"])),
                share_volume=parse_int(first_value(record, ["shareVolume", "share_volume", "share volume", "volume"])),
                turnover=parse_decimal(first_value(record, ["turnover", "turnoverRs", "turnover_rs", "turnover rs"])),
                change_amount=parse_decimal(first_value(record, ["changeAmount", "change_amount", "change rs"])),
                change_percent=parse_decimal(first_value(record, ["changePercent", "change_percent", "change percent", "change"])),
                ytd_change_percent=parse_decimal(first_value(record, ["ytdChangePercent", "ytd_change_percent", "ytd change percent"])),
                raw_row={**record, "industryGroupName": industry_group_name},
            )
        )
    return rows


def parse_classification_payload(text: str, industry_group_name: str) -> list[GicsClassificationRow]:
    stripped = text.strip()
    if not stripped:
        return []
    if stripped.startswith("{") or stripped.startswith("["):
        try:
            return _classification_rows_from_records(parse_possible_json_table(json.loads(stripped)), industry_group_name)
        except json.JSONDecodeError:
            return []
    if "," in stripped[:1000] and "<table" not in stripped.lower():
        return _classification_rows_from_records(rows_from_csv(stripped), industry_group_name)
    return parse_classification_table(text, industry_group_name)


def dedupe_classification_rows(rows: list[GicsClassificationRow]) -> tuple[list[GicsClassificationRow], list[str]]:
    seen: set[str] = set()
    duplicates: list[str] = []
    deduped: list[GicsClassificationRow] = []
    for row in rows:
        if row.normalized_symbol in seen:
            duplicates.append(row.normalized_symbol)
            continue
        seen.add(row.normalized_symbol)
        deduped.append(row)
    return deduped, duplicates


def run_gics_import(summary_url: str, indices_url: str, classification_url: str) -> dict[str, Any]:
    assert_gics_source_url(summary_url, "/equity/gics-industry-group-summary")
    assert_gics_source_url(indices_url, "/equity/gics-industry-group-indices")
    assert_gics_source_url(classification_url, "/listed-entities/gics-classification")

    warnings: list[str] = []
    fetched_at = datetime.now(timezone.utc).isoformat()
    download_discovery_report: dict[str, Any] = {}

    summary_html = fetch_text(summary_url)
    summary_candidates = discover_download_candidates(summary_url, summary_html)
    download_discovery_report["summaryCandidates"] = summary_candidates
    summary_rows, group_rows = parse_summary_table(summary_html)
    summary_fetch_mode = "html-table"
    if len(summary_rows) < settings.cse_gics_min_expected_groups:
        warnings.append(f"GICS Summary row count {len(summary_rows)} is below configured expected group count {settings.cse_gics_min_expected_groups}.")
    if len(group_rows) < settings.cse_gics_min_expected_groups:
        warnings.append(f"GICS industry group mapping count {len(group_rows)} is below configured expected group count {settings.cse_gics_min_expected_groups}.")

    indices_html = fetch_text(indices_url)
    indices_candidates = discover_download_candidates(indices_url, indices_html)
    download_discovery_report["indicesCandidates"] = indices_candidates
    index_rows = parse_indices_table(indices_html)
    indices_fetch_mode = "html-table"
    if len(index_rows) < settings.cse_gics_min_expected_groups:
        warnings.append(f"GICS Indices row count {len(index_rows)} is below configured expected group count {settings.cse_gics_min_expected_groups}.")

    classification_html = fetch_text(classification_url)
    classification_candidates = discover_download_candidates(classification_url, classification_html)
    download_discovery_report["classificationCandidates"] = classification_candidates
    industry_groups = discover_industry_groups(group_rows, classification_html)
    attempted = len(industry_groups)
    successful = 0
    failed = 0
    group_failures: list[dict[str, Any]] = []
    group_fetch_report: list[dict[str, Any]] = []
    all_classification_rows: list[GicsClassificationRow] = []

    default_group = detect_selected_group(classification_html) or (industry_groups[0] if industry_groups else "Unknown")
    default_rows = parse_classification_table(classification_html, default_group)
    if default_rows:
        successful += 1
        all_classification_rows.extend(default_rows)
        group_fetch_report.append({"industryGroupName": default_group, "fetchMode": "html-table-default", "rowCount": len(default_rows), "status": "success", "attemptedUrls": [classification_url]})
    elif industry_groups:
        group_fetch_report.append({"industryGroupName": default_group, "fetchMode": "html-table-default", "rowCount": 0, "status": "empty", "attemptedUrls": [classification_url]})

    for group in industry_groups:
        if group == default_group:
            continue
        group_rows_found: list[GicsClassificationRow] = []
        attempted_urls = build_possible_classification_urls(classification_url, group)
        fetch_mode = "unresolved"
        last_error: str | None = None
        for candidate_url in attempted_urls:
            try:
                text = fetch_text(candidate_url, timeout_seconds=min(settings.cse_gics_timeout_seconds, 30))
                rows = parse_classification_payload(text, group)
                if rows:
                    group_rows_found = rows
                    fetch_mode = "api-json" if text.lstrip().startswith(("{", "[")) else ("csv-download" if "<table" not in text.lower() and "," in text[:1000] else "html-table")
                    break
            except Exception as exc:  # keep trying candidate URLs; final group failure is recorded below
                last_error = str(exc)
                continue
        if group_rows_found:
            successful += 1
            all_classification_rows.extend(group_rows_found)
            group_fetch_report.append({"industryGroupName": group, "fetchMode": fetch_mode, "rowCount": len(group_rows_found), "status": "success", "attemptedUrls": attempted_urls})
        else:
            failed += 1
            error = last_error or "No rows could be fetched with lightweight HTTP/API/CSV/HTML methods."
            group_failures.append({"industryGroupName": group, "error": error})
            group_fetch_report.append({"industryGroupName": group, "fetchMode": fetch_mode, "rowCount": 0, "status": "failed", "error": error, "attemptedUrls": attempted_urls})

    deduped_rows, duplicate_symbols = dedupe_classification_rows(all_classification_rows)
    if len(deduped_rows) < settings.cse_gics_min_expected_classification_rows:
        warnings.append(
            f"GICS Classification row count {len(deduped_rows)} is below configured minimum {settings.cse_gics_min_expected_classification_rows}."
        )
    if successful < max(1, settings.cse_gics_min_expected_groups - 2):
        warnings.append(f"GICS Classification succeeded for only {successful} groups out of {attempted} attempted groups.")

    return {
        "status": "success" if deduped_rows else "partial_success",
        "source": "CSE_GICS",
        "fetchMode": "python-http",
        "browserAutomationEnabled": False,
        "playwrightEnabled": False,
        "fetchedAt": fetched_at,
        "summaryUrl": summary_url,
        "indicesUrl": indices_url,
        "classificationUrl": classification_url,
        "checksum": checksum_text(summary_html + indices_html + classification_html),
        "summary": {
            "fetchMode": summary_fetch_mode,
            "rowCount": len(summary_rows),
            "rows": [row.to_backend_dict() for row in summary_rows],
            "industryGroups": [row.to_backend_dict() for row in group_rows],
        },
        "indices": {"fetchMode": indices_fetch_mode, "rowCount": len(index_rows), "rows": [row.to_backend_dict() for row in index_rows]},
        "classification": {
            "fetchMode": "mixed-lightweight",
            "groupsAttempted": attempted,
            "groupsSuccessful": successful,
            "groupsFailed": failed,
            "groupFailures": group_failures,
            "groupFetchReport": group_fetch_report,
            "rowCount": len(deduped_rows),
            "recordsBeforeDeduplication": len(all_classification_rows),
            "recordsDeduplicated": len(all_classification_rows) - len(deduped_rows),
            "duplicateSymbols": duplicate_symbols,
            "rows": [row.to_backend_dict() for row in deduped_rows],
        },
        "warnings": warnings,
        "rawResponses": {
            "summaryHtmlSha256": checksum_text(summary_html),
            "indicesHtmlSha256": checksum_text(indices_html),
            "classificationHtmlSha256": checksum_text(classification_html),
            "industryGroupsAttempted": industry_groups,
            "downloadDiscoveryReport": download_discovery_report,
            "groupFetchReport": group_fetch_report,
        },
    }
