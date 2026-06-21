from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup
from .config import settings


class CseDailyMarketSummaryImportError(RuntimeError):
    pass


class CseDailyMarketSummaryFetchError(CseDailyMarketSummaryImportError):
    pass


class CseDailyMarketSummaryParseError(CseDailyMarketSummaryImportError):
    pass


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()


SECTION_METRICS: dict[str, dict[str, str]] = {
    "PRICE_INDICES": {
        "CSE ALL SHARE PRICE INDEX": "aspi",
        "S&P SL20": "sp_sl20",
        "TRI ON ALL SHARE (ASTRI)": "astri",
        "TRI ON S&P SL20": "tri_sp_sl20",
    },
    "EQUITY": {
        "VALUE OF TURNOVER(RS.)": "equity_turnover",
        "VALUE OF TURNOVER(RS)": "equity_turnover",
        "DOMESTIC PURCHASES": "domestic_purchases",
        "DOMESTIC SALES": "domestic_sales",
        "FOREIGN PURCHASES": "foreign_purchases",
        "FOREIGN SALES": "foreign_sales",
        "VOLUME OF TURNOVER(NO.)": "turnover_volume",
        "VOLUME OF TURNOVER(NO)": "turnover_volume",
        "DOMESTIC": "domestic_submetric",
        "FOREIGN": "foreign_submetric",
        "TRADES(NO.)": "trades",
        "TRADES(NO)": "trades",
    },
    "DEBT": {
        "CORPORATE DEBT": "corporate_debt",
        "GOVERNMENT DEBT": "government_debt",
    },
    "MARKET": {
        "LISTED COMPANIES (NO.)": "listed_companies",
        "LISTED COMPANIES (NO)": "listed_companies",
        "TRADED COMPANIES (NO.)": "traded_companies",
        "TRADED COMPANIES (NO)": "traded_companies",
        "MARKET PRICE EARNINGS RATIO(PER)": "market_per",
        "MARKET PRICE EARNINGS RATIO (PER)": "market_per",
        "MARKET PRICE TO BOOK VALUE (PBV)": "market_pbv",
        "MARKET DIVIDEND YIELD (DY)": "market_dy",
        "MARKET CAPITALIZATION (RS.)": "market_cap",
        "MARKET CAPITALIZATION (RS)": "market_cap",
    },
}

CDS_METRICS = {
    "CDS HOLDINGS TOTAL": "cds_total",
    "CDS HOLDINGS DOMESTIC": "cds_domestic",
    "CDS HOLDINGS FOREIGN": "cds_foreign",
}

REQUIRED_FIELDS = [
    "tradingDate",
    "aspiToday",
    "aspiPrevious",
    "spSl20Today",
    "spSl20Previous",
    "equityTurnoverToday",
    "equityTurnoverPrevious",
    "marketCapToday",
    "marketCapPrevious",
    "listedCompaniesToday",
    "tradedCompaniesToday",
]

OPTIONAL_FIELDS = [
    "astriToday",
    "astriPrevious",
    "triSpSl20Today",
    "triSpSl20Previous",
    "cdsTotalQuantity",
    "cdsTotalMarketValue",
    "corporateDebtToday",
    "corporateDebtPrevious",
    "governmentDebtToday",
    "governmentDebtPrevious",
    "marketPerToday",
    "marketPerPrevious",
    "marketPbvToday",
    "marketPbvPrevious",
    "marketDyToday",
    "marketDyPrevious",
    "domesticPurchasesToday",
    "domesticSalesToday",
    "foreignPurchasesToday",
    "foreignSalesToday",
]


def assert_daily_market_summary_source_url(source_url: str) -> None:
    parsed = urlparse(source_url)
    if parsed.scheme not in {"http", "https"}:
        raise CseDailyMarketSummaryImportError("Invalid CSE Daily Market Summary source URL")
    if parsed.hostname not in {"www.cse.lk", "cse.lk"}:
        raise CseDailyMarketSummaryImportError("Only cse.lk URLs are allowed for the Daily Market Summary importer")
    if "/equity/daily-market-summary" not in parsed.path:
        raise CseDailyMarketSummaryImportError("Only the CSE equity/daily-market-summary page is allowed for this importer")


def api_url_from_source(source_url: str) -> str:
    parsed = urlparse(source_url)
    return f"{parsed.scheme}://{parsed.netloc}/api/dailyMarketSummery"


def normalize_label(value: str) -> str:
    text = clean_text(value).upper()
    text = text.replace("RS .", "RS.").replace("RS ", "RS")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def camel_case(metric: str, suffix: str | None = None) -> str:
    parts = metric.split("_") + ([suffix] if suffix else [])
    return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])


def parse_decimal(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float, Decimal)):
        return float(value)
    text = clean_text(str(value))
    if not text or text in {"-", "—", "N/A", "NA"}:
        return None
    text = text.replace(",", "").replace("%", "").replace("+", "")
    text = re.sub(r"[^0-9.\-]", "", text)
    if text in {"", "-", "."}:
        return None
    try:
        return float(Decimal(text))
    except (InvalidOperation, ValueError):
        return None


def parse_int(value: Any) -> int | None:
    parsed = parse_decimal(value)
    if parsed is None:
        return None
    return int(parsed)


def parse_as_of_date(text: str | None) -> str | None:
    if not text:
        return None
    cleaned = clean_text(text).upper()
    for fmt in ("%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(cleaned, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def find_as_of_text(soup: BeautifulSoup) -> str | None:
    text = soup.get_text(" ", strip=True)
    match = re.search(r"AS OF\s+([0-9]{1,2}\s+[A-Z]{3,9}\s+[0-9]{4})", text, re.I)
    if match:
        return clean_text(match.group(1)).upper()
    return None


def assign_metric(summary: dict[str, Any], metric_key: str, today: Any, previous: Any, section: str, context: dict[str, str]) -> None:
    if metric_key == "domestic_submetric":
        active = context.get("activeEquityGroup")
        if active == "turnover_volume":
            summary["turnoverVolumeDomesticToday"] = parse_int(today)
            summary["turnoverVolumeDomesticPrevious"] = parse_int(previous)
        elif active == "trades":
            summary["tradesDomesticToday"] = parse_int(today)
            summary["tradesDomesticPrevious"] = parse_int(previous)
        return
    if metric_key == "foreign_submetric":
        active = context.get("activeEquityGroup")
        if active == "turnover_volume":
            summary["turnoverVolumeForeignToday"] = parse_int(today)
            summary["turnoverVolumeForeignPrevious"] = parse_int(previous)
        elif active == "trades":
            summary["tradesForeignToday"] = parse_int(today)
            summary["tradesForeignPrevious"] = parse_int(previous)
        return

    if metric_key in {"turnover_volume", "trades"}:
        context["activeEquityGroup"] = metric_key
    elif section == "EQUITY" and metric_key not in {"domestic_submetric", "foreign_submetric"}:
        context.pop("activeEquityGroup", None)

    integer_metrics = {"turnover_volume", "trades", "listed_companies", "traded_companies"}
    parse = parse_int if metric_key in integer_metrics else parse_decimal
    summary[camel_case(metric_key, "today")] = parse(today)
    summary[camel_case(metric_key, "previous")] = parse(previous)


def parse_html_summary(html: str, source_url: str) -> tuple[dict[str, Any], dict[str, Any], list[str]]:
    soup = BeautifulSoup(html, "lxml")
    as_of_text = find_as_of_text(soup)
    trading_date = parse_as_of_date(as_of_text)
    warnings: list[str] = []
    summary: dict[str, Any] = {
        "tradingDate": trading_date,
        "sourceAsOfText": as_of_text,
    }
    parsed_tables: list[dict[str, Any]] = []

    for table_index, table in enumerate(soup.select("table"), start=1):
        header_cells = [clean_text(cell.get_text(" ", strip=True)) for cell in table.select("thead th")]
        if not header_cells:
            first_row = table.select_one("tr")
            header_cells = [clean_text(cell.get_text(" ", strip=True)) for cell in first_row.select("th,td")] if first_row else []
        if not header_cells:
            continue
        section_label = normalize_label(header_cells[0])
        section_key = section_label.replace(" ", "_")
        rows_report: list[dict[str, Any]] = []
        context: dict[str, str] = {}

        for row_index, tr in enumerate(table.select("tbody tr") or table.select("tr")[1:], start=1):
            cells = [clean_text(cell.get_text(" ", strip=True)) for cell in tr.select("td")]
            if not cells or all(not cell for cell in cells):
                continue
            label = normalize_label(cells[0])
            if not label:
                continue
            raw_row = {"label": cells[0], "cells": cells, "rowIndex": row_index}
            rows_report.append(raw_row)
            if section_key == "HOLDINGS_IN_CDS":
                metric = CDS_METRICS.get(label)
                if not metric:
                    warnings.append(f"Unmapped Daily Market Summary CDS row: {cells[0]}")
                    continue
                summary[camel_case(metric, "quantity")] = parse_int(cells[1] if len(cells) > 1 else None)
                summary[camel_case(metric, "marketValue")] = parse_decimal(cells[2] if len(cells) > 2 else None)
                continue

            metric = SECTION_METRICS.get(section_key, {}).get(label)
            if not metric:
                warnings.append(f"Unmapped Daily Market Summary row in {section_label}: {cells[0]}")
                continue
            assign_metric(summary, metric, cells[1] if len(cells) > 1 else None, cells[2] if len(cells) > 2 else None, section_key, context)

        parsed_tables.append({"tableIndex": table_index, "section": section_label, "headers": header_cells, "rows": rows_report})

    raw_payload = {
        "sourceMode": "html",
        "sourceUrl": source_url,
        "htmlLength": len(html),
        "asOfText": as_of_text,
        "parsedTables": parsed_tables,
    }
    return summary, raw_payload, warnings


def find_first_record(payload: Any) -> dict[str, Any] | None:
    if isinstance(payload, dict):
        candidates: list[dict[str, Any]] = []
        stack: list[Any] = [payload]
        while stack:
            current = stack.pop()
            if isinstance(current, dict):
                if any("trade" in key.lower() or "market" in key.lower() or key.lower() in {"asi", "spp", "per", "pbv", "dy"} for key in current.keys()):
                    candidates.append(current)
                stack.extend(current.values())
            elif isinstance(current, list):
                stack.extend(current)
        if candidates:
            return max(candidates, key=lambda item: len(item))
    elif isinstance(payload, list):
        for item in payload:
            found = find_first_record(item)
            if found:
                return found
    return None


def normalize_api_summary(record: dict[str, Any], source_url: str) -> tuple[dict[str, Any], dict[str, Any], list[str]]:
    normalized = {re.sub(r"[^a-z0-9]", "", key.lower()): value for key, value in record.items()}

    def value(*aliases: str) -> Any:
        for alias in aliases:
            key = re.sub(r"[^a-z0-9]", "", alias.lower())
            if key in normalized:
                return normalized[key]
        return None

    as_of_text = clean_text(str(value("tradeDate", "tradingDate", "date", "asOf") or "")) or None
    trading_date = parse_as_of_date(as_of_text) or clean_text(str(value("tradeDate", "tradingDate", "date") or ""))[:10] or None
    summary = {
        "tradingDate": trading_date,
        "sourceAsOfText": as_of_text,
        "aspiToday": parse_decimal(value("asi", "aspi", "allSharePriceIndex", "aspiToday")),
        "aspiPrevious": parse_decimal(value("asiPrevious", "aspiPrevious", "previousAsi", "previousAspi", "allSharePriceIndexPrevious")),
        "spSl20Today": parse_decimal(value("spp", "spSl20", "spsl20", "spSl20Today")),
        "spSl20Previous": parse_decimal(value("sppPrevious", "spSl20Previous", "spsl20Previous", "previousSpp", "previousSpSl20")),
        "astriToday": parse_decimal(value("astri", "astriToday", "triAllShare")),
        "astriPrevious": parse_decimal(value("astriPrevious", "previousAstri", "triAllSharePrevious")),
        "triSpSl20Today": parse_decimal(value("triSpSl20", "triSpsl20", "triSpSl20Today")),
        "triSpSl20Previous": parse_decimal(value("triSpSl20Previous", "triSpsl20Previous", "previousTriSpSl20")),
        "equityTurnoverToday": parse_decimal(value("equityTurnover", "marketTurnover", "turnover", "equityTurnoverToday")),
        "equityTurnoverPrevious": parse_decimal(value("equityTurnoverPrevious", "marketTurnoverPrevious", "turnoverPrevious", "previousEquityTurnover")),
        "domesticPurchasesToday": parse_decimal(value("equityDomesticPurchase", "domesticPurchases", "domesticPurchasesToday")),
        "domesticPurchasesPrevious": parse_decimal(value("equityDomesticPurchasePrevious", "domesticPurchasesPrevious", "previousDomesticPurchases")),
        "domesticSalesToday": parse_decimal(value("equityDomesticSales", "domesticSales", "domesticSalesToday")),
        "domesticSalesPrevious": parse_decimal(value("equityDomesticSalesPrevious", "domesticSalesPrevious", "previousDomesticSales")),
        "foreignPurchasesToday": parse_decimal(value("equityForeignPurchase", "foreignPurchases", "foreignPurchasesToday")),
        "foreignPurchasesPrevious": parse_decimal(value("equityForeignPurchasePrevious", "foreignPurchasesPrevious", "previousForeignPurchases")),
        "foreignSalesToday": parse_decimal(value("equityForeignSales", "foreignSales", "foreignSalesToday")),
        "foreignSalesPrevious": parse_decimal(value("equityForeignSalesPrevious", "foreignSalesPrevious", "previousForeignSales")),
        "turnoverVolumeToday": parse_int(value("turnoverVolume", "volumeOfTurnover", "turnoverVolumeToday")),
        "turnoverVolumePrevious": parse_int(value("turnoverVolumePrevious", "volumeOfTurnoverPrevious", "previousTurnoverVolume")),
        "tradesToday": parse_int(value("trades", "tradesNumber", "tradesToday")),
        "tradesPrevious": parse_int(value("tradesPrevious", "previousTrades", "tradesNumberPrevious")),
        "listedCompaniesToday": parse_int(value("listedCompanyNumber", "listedCompanies", "listedCompaniesToday")),
        "listedCompaniesPrevious": parse_int(value("listedCompanyNumberPrevious", "listedCompaniesPrevious", "previousListedCompanies")),
        "tradedCompaniesToday": parse_int(value("tradedCompanyNumber", "tradedCompanies", "tradedCompaniesToday")),
        "tradedCompaniesPrevious": parse_int(value("tradedCompanyNumberPrevious", "tradedCompaniesPrevious", "previousTradedCompanies")),
        "marketPerToday": parse_decimal(value("per", "marketPer", "marketPerToday")),
        "marketPerPrevious": parse_decimal(value("perPrevious", "marketPerPrevious", "previousPer")),
        "marketPbvToday": parse_decimal(value("pbv", "marketPbv", "marketPbvToday")),
        "marketPbvPrevious": parse_decimal(value("pbvPrevious", "marketPbvPrevious", "previousPbv")),
        "marketDyToday": parse_decimal(value("dy", "marketDy", "marketDyToday")),
        "marketDyPrevious": parse_decimal(value("dyPrevious", "marketDyPrevious", "previousDy")),
        "marketCapToday": parse_decimal(value("marketCap", "marketCapitalization", "marketCapToday")),
        "marketCapPrevious": parse_decimal(value("marketCapPrevious", "marketCapitalizationPrevious", "previousMarketCap")),
        "cdsTotalQuantity": parse_int(value("cdsHoldingsTotal", "cdsTotalQuantity")),
        "cdsTotalMarketValue": parse_decimal(value("cdsHoldingsTotalMarketValue", "cdsTotalMarketValue")),
        "corporateDebtToday": parse_decimal(value("corporateDebtValue", "corporateDebt", "corporateDebtToday")),
        "corporateDebtPrevious": parse_decimal(value("corporateDebtValuePrevious", "corporateDebtPrevious", "previousCorporateDebt")),
        "governmentDebtToday": parse_decimal(value("governmentDebtValue", "governmentDebt", "governmentDebtToday")),
        "governmentDebtPrevious": parse_decimal(value("governmentDebtValuePrevious", "governmentDebtPrevious", "previousGovernmentDebt")),
    }
    raw_payload = {"sourceMode": "api", "sourceUrl": source_url, "record": record}
    return summary, raw_payload, []


def parse_api_payload(payload: Any, source_url: str) -> tuple[dict[str, Any], dict[str, Any], list[str]]:
    record = find_first_record(payload)
    if not record:
        raise CseDailyMarketSummaryParseError("CSE Daily Market Summary API response did not contain a recognizable market summary record")
    summary, raw_payload, warnings = normalize_api_summary(record, source_url)
    raw_payload["payload"] = payload
    return summary, raw_payload, warnings


def missing_required_fields(summary: dict[str, Any]) -> list[str]:
    return [field for field in REQUIRED_FIELDS if summary.get(field) is None]


def merge_api_and_html_summary(api_summary: dict[str, Any], html_summary: dict[str, Any]) -> dict[str, Any]:
    merged = dict(html_summary)
    for key, value in api_summary.items():
        if value is not None:
            merged[key] = value
    return merged

def fetch_api_summary(source_url: str) -> tuple[dict[str, Any], dict[str, Any], list[str]]:
    endpoint = api_url_from_source(source_url)
    headers = {
        "User-Agent": settings.cse_import_user_agent,
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Referer": source_url,
        "Origin": "https://www.cse.lk",
    }
    with httpx.Client(timeout=settings.cse_daily_market_summary_timeout_seconds, follow_redirects=True, headers=headers) as client:
        response = client.post(endpoint, data={})
    if response.status_code != 200:
        raise CseDailyMarketSummaryFetchError(f"CSE Daily Market Summary API returned status {response.status_code}")
    try:
        payload = response.json()
    except ValueError as exc:
        raise CseDailyMarketSummaryParseError(f"CSE Daily Market Summary API returned invalid JSON: {exc}") from exc
    record = find_first_record(payload)
    if not record:
        raise CseDailyMarketSummaryParseError("CSE Daily Market Summary API response did not contain a recognizable market summary record")
    summary, raw_payload, warnings = parse_api_payload(payload, source_url)
    raw_payload["endpoint"] = endpoint
    raw_payload["statusCode"] = response.status_code
    return summary, raw_payload, warnings


def fetch_page_html(source_url: str) -> str:
    headers = {
        "User-Agent": settings.cse_import_user_agent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    with httpx.Client(timeout=settings.cse_daily_market_summary_timeout_seconds, follow_redirects=True, headers=headers) as client:
        response = client.get(source_url)
    if response.status_code != 200:
        raise CseDailyMarketSummaryFetchError(f"CSE Daily Market Summary page returned status {response.status_code}")
    return response.text


def validate_summary(summary: dict[str, Any], warnings: list[str]) -> dict[str, Any]:
    errors: list[str] = []
    for field in REQUIRED_FIELDS:
        if summary.get(field) is None:
            errors.append(f"Required Daily Market Summary field missing: {field}")
    for field in OPTIONAL_FIELDS:
        if summary.get(field) is None:
            warnings.append(f"Optional Daily Market Summary field missing: {field}")
    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "requiredFields": REQUIRED_FIELDS,
        "parsedFieldCount": len([value for value in summary.values() if value is not None]),
        "promotionAllowed": len(errors) == 0,
    }


def run_daily_market_summary_import(source_url: str | None = None, html: str | None = None, api_payload: Any | None = None) -> dict[str, Any]:
    url = source_url or settings.cse_daily_market_summary_source_url
    assert_daily_market_summary_source_url(url)
    fetched_at = datetime.now(timezone.utc).isoformat()
    warnings: list[str] = []
    active_fetch_strategy = "api"

    if api_payload is not None:
        api_summary, api_raw_payload, api_warnings = parse_api_payload(api_payload, url)
        warnings.extend(api_warnings)
        api_missing = missing_required_fields(api_summary)
        if api_missing:
            warnings.append(
                "Daily Market Summary API response was partial; HTML table fallback/merge was used for missing required fields: "
                + ", ".join(api_missing)
            )
            if html is None:
                html = fetch_page_html(url)
            html_summary, html_raw_payload, html_warnings = parse_html_summary(html, url)
            warnings.extend(html_warnings)
            summary = merge_api_and_html_summary(api_summary, html_summary)
            raw_payload = {
                "sourceMode": "api-partial-html-merge",
                "sourceUrl": url,
                "apiRawPayload": api_raw_payload,
                "htmlRawPayload": html_raw_payload,
                "apiMissingRequiredFields": api_missing,
            }
            active_fetch_strategy = "api-partial-html-merge"
        else:
            summary, raw_payload = api_summary, api_raw_payload
            active_fetch_strategy = "api"
    elif html is not None:
        summary, raw_payload, parse_warnings = parse_html_summary(html, url)
        active_fetch_strategy = "html-fixture"
        warnings.extend(parse_warnings)
    else:
        try:
            api_summary, api_raw_payload, api_warnings = fetch_api_summary(url)
            warnings.extend(api_warnings)
            api_missing = missing_required_fields(api_summary)
            if api_missing:
                warnings.append(
                    "Daily Market Summary API response was partial; HTML table fallback/merge was used for missing required fields: "
                    + ", ".join(api_missing)
                )
                html_text = fetch_page_html(url)
                html_summary, html_raw_payload, html_warnings = parse_html_summary(html_text, url)
                warnings.extend(html_warnings)
                summary = merge_api_and_html_summary(api_summary, html_summary)
                raw_payload = {
                    "sourceMode": "api-partial-html-merge",
                    "sourceUrl": url,
                    "apiRawPayload": api_raw_payload,
                    "htmlRawPayload": html_raw_payload,
                    "apiMissingRequiredFields": api_missing,
                }
                active_fetch_strategy = "api-partial-html-merge"
            else:
                summary, raw_payload = api_summary, api_raw_payload
                active_fetch_strategy = "api"
        except CseDailyMarketSummaryImportError as api_error:
            warnings.append(f"Daily Market Summary API fetch failed; trying HTML table fallback. {api_error}")
            html_text = fetch_page_html(url)
            summary, raw_payload, parse_warnings = parse_html_summary(html_text, url)
            active_fetch_strategy = "html"
            warnings.extend(parse_warnings)

    validation_report = validate_summary(summary, warnings.copy())
    if not validation_report["valid"]:
        raise CseDailyMarketSummaryParseError("Daily Market Summary validation failed: " + " | ".join(validation_report["errors"]))

    checksum_source = json.dumps(raw_payload, sort_keys=True, default=str)
    checksum = hashlib.sha256(checksum_source.encode("utf-8")).hexdigest()
    return {
        "status": "success",
        "source": "CSE_DAILY_MARKET_SUMMARY",
        "sourceUrl": url,
        "fetchMode": "python-http",
        "fetchStrategy": "api-first-html-fallback",
        "activeFetchStrategy": active_fetch_strategy,
        "apiEndpoint": api_url_from_source(url),
        "fetchedAt": fetched_at,
        "tradingDate": summary.get("tradingDate"),
        "sourceAsOfText": summary.get("sourceAsOfText"),
        "rowCount": 1,
        "recordsBeforeDeduplication": 1,
        "recordsDeduplicated": 0,
        "checksum": checksum,
        "warnings": warnings,
        "validationReport": validation_report,
        "rawPayload": raw_payload,
        "summary": summary,
    }
