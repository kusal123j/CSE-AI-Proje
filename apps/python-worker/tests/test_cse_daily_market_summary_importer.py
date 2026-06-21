from pathlib import Path

import json

import pytest

from app.cse_daily_market_summary_importer import (
    CseDailyMarketSummaryParseError,
    run_daily_market_summary_import,
)

SOURCE_URL = "https://www.cse.lk/equity/daily-market-summary"
FIXTURE_HTML = Path(__file__).parent.joinpath("fixtures", "daily_market_summary.html").read_text(encoding="utf-8")


def test_daily_market_summary_html_fixture_parses_core_fields():
    result = run_daily_market_summary_import(SOURCE_URL, html=FIXTURE_HTML)
    summary = result["summary"]

    assert result["status"] == "success"
    assert result["fetchMode"] == "python-http"
    assert result["activeFetchStrategy"] == "html-fixture"
    assert result["tradingDate"] == "2026-06-19"
    assert summary["sourceAsOfText"] == "19 JUN 2026"
    assert summary["aspiToday"] == 22361.31
    assert summary["aspiPrevious"] == 22436.14
    assert summary["spSl20Today"] == 6215.30
    assert summary["spSl20Previous"] == 6226.78
    assert summary["equityTurnoverToday"] == 1878916860.0
    assert summary["equityTurnoverPrevious"] == 3122344700.0
    assert summary["foreignPurchasesToday"] == 10159561.0
    assert summary["foreignSalesToday"] == 389604544.0
    assert summary["turnoverVolumeToday"] == 75782112
    assert summary["turnoverVolumeDomesticToday"] == 70338448
    assert summary["turnoverVolumeForeignToday"] == 5443657
    assert summary["tradesToday"] == 18759
    assert summary["tradesDomesticToday"] == 18308
    assert summary["tradesForeignToday"] == 451
    assert summary["marketCapToday"] == 8115215991623.0
    assert summary["marketCapPrevious"] == 8136380984550.0
    assert summary["cdsTotalQuantity"] == 187740193000
    assert summary["cdsForeignMarketValue"] == 1274929480000.0
    assert result["validationReport"]["valid"] is True
    assert result["checksum"]


def test_daily_market_summary_complete_api_payload_can_be_accepted_without_html():
    api_payload = json.loads(Path(__file__).parent.joinpath("fixtures", "daily_market_summary_api_complete.json").read_text(encoding="utf-8"))

    result = run_daily_market_summary_import(SOURCE_URL, api_payload=api_payload)

    assert result["activeFetchStrategy"] == "api"
    assert result["summary"]["aspiPrevious"] == 22436.14
    assert result["summary"]["marketCapPrevious"] == 8136380984550.0
    assert result["validationReport"]["valid"] is True


def test_daily_market_summary_partial_api_payload_merges_with_html_previous_day_fields():
    api_payload = json.loads(Path(__file__).parent.joinpath("fixtures", "daily_market_summary_api_partial.json").read_text(encoding="utf-8"))

    result = run_daily_market_summary_import(SOURCE_URL, html=FIXTURE_HTML, api_payload=api_payload)

    assert result["activeFetchStrategy"] == "api-partial-html-merge"
    assert result["summary"]["aspiToday"] == 22361.31
    assert result["summary"]["aspiPrevious"] == 22436.14
    assert result["summary"]["spSl20Previous"] == 6226.78
    assert result["summary"]["equityTurnoverPrevious"] == 3122344700.0
    assert result["summary"]["marketCapPrevious"] == 8136380984550.0
    assert any("API response was partial" in warning for warning in result["warnings"])
    assert result["validationReport"]["valid"] is True


def test_daily_market_summary_missing_key_previous_day_field_fails_validation():
    broken_html = FIXTURE_HTML.replace("22,436.14", "")

    with pytest.raises(CseDailyMarketSummaryParseError) as exc:
        run_daily_market_summary_import(SOURCE_URL, html=broken_html)

    assert "aspiPrevious" in str(exc.value)
