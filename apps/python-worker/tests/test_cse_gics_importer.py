from pathlib import Path
from dataclasses import replace

from app import cse_gics_importer as importer

FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def test_parse_summary_metric_table_returns_twenty_rows():
    rows = importer.parse_summary_metric_table(fixture("gics_summary.html"))

    assert len(rows) == 20
    assert rows[0].industry_group_code == "SPCSEEIP"
    assert rows[0].index_value == 3070.92
    assert rows[0].turnover_value == 12251764.00
    assert rows[0].companies_listed == 3


def test_parse_summary_group_mapping_table_returns_twenty_groups():
    rows = importer.parse_summary_group_mapping_table(fixture("gics_summary.html"))

    assert len(rows) == 20
    assert rows[0].industry_group_code == "SPCSEEIP"
    assert rows[0].gics_code == "1010"
    assert rows[0].symbol == "EGY"
    assert rows[0].industry_group_name == "Energy"
    assert rows[-1].industry_group_name == "Real Estate Management&Development"


def test_parse_indices_table_returns_twenty_rows_with_group_headers():
    rows = importer.parse_indices_table(fixture("gics_indices.html"))

    assert len(rows) == 20
    assert rows[0].industry_group_name == "S&P/CSE Energy Industry Group Index"
    assert rows[0].index_code == "SPCSEEIP"
    assert rows[0].gics_code == "1010"
    assert rows[0].today_index == 3068.82
    assert rows[0].previous_index == 3083.91
    assert rows[0].trades == 177


def test_parse_classification_table_returns_visible_energy_rows():
    rows = importer.parse_classification_table(fixture("gics_classification_energy.html"), "Energy")

    assert len(rows) == 3
    assert rows[0].company_name == "LAUGFS GAS PLC"
    assert rows[0].symbol == "LGL.N0000"
    assert rows[0].last_traded_price == 54.10
    assert rows[0].turnover == 963971.40
    assert rows[0].change_amount == -1.0
    assert rows[0].change_percent == -1.81
    assert rows[2].symbol == "LIOC.N0000"


def test_summary_headers_are_not_confused_with_first_data_row():
    tables = importer.parse_html_tables(fixture("gics_summary.html"))

    assert "gig" in tables[0][0]
    assert "SPCSEEIP" not in tables[0][0]
    assert "industry group code" in tables[1][0]
    assert "Energy" not in tables[1][0]


def test_classification_headers_are_not_confused_with_first_company_row():
    tables = importer.parse_html_tables(fixture("gics_classification_energy.html"))

    assert "company name" in tables[0][0]
    assert "LAUGFS GAS PLC" not in tables[0][0]


def test_numeric_and_symbol_normalization():
    assert importer.parse_decimal("1,234.50") == 1234.50
    assert importer.parse_decimal("+3.25%") == 3.25
    assert importer.parse_decimal("-") is None
    assert importer.normalize_symbol(" lioc.n0000 ") == "LIOC.N0000"


def test_dedupe_classification_rows_by_symbol():
    rows = importer.parse_classification_table(fixture("gics_classification_energy.html"), "Energy")
    deduped, duplicates = importer.dedupe_classification_rows([rows[0], rows[1], rows[0]])

    assert [row.symbol for row in deduped] == ["LGL.N0000", "LGL.X0000"]
    assert duplicates == ["LGL.N0000"]


def test_discover_industry_groups_uses_official_summary_mapping():
    _summary_rows, group_rows = importer.parse_summary_table(fixture("gics_summary.html"))
    groups = importer.discover_industry_groups(group_rows, fixture("gics_classification_energy.html"))

    assert len(groups) == 20
    assert groups[0] == "Energy"
    assert "Banks" in groups


def test_run_gics_import_uses_no_browser_automation_and_reports_partial_group_failures(monkeypatch):
    summary_html = fixture("gics_summary.html")
    indices_html = fixture("gics_indices.html")
    classification_html = fixture("gics_classification_energy.html")

    def fake_fetch_text(url: str, timeout_seconds: int | None = None) -> str:
        if "gics-industry-group-summary" in url:
            return summary_html
        if "gics-industry-group-indices" in url:
            return indices_html
        if url == "https://www.cse.lk/listed-entities/gics-classification":
            return classification_html
        raise RuntimeError("candidate URL not available in fixture test")

    monkeypatch.setattr(importer, "fetch_text", fake_fetch_text)
    monkeypatch.setattr(importer, "settings", replace(importer.settings, cse_gics_min_expected_classification_rows=1))

    result = importer.run_gics_import(
        "https://www.cse.lk/equity/gics-industry-group-summary",
        "https://www.cse.lk/equity/gics-industry-group-indices",
        "https://www.cse.lk/listed-entities/gics-classification",
    )

    assert result["browserAutomationEnabled"] is False
    assert result["playwrightEnabled"] is False
    assert result["summary"]["rowCount"] == 20
    assert result["indices"]["rowCount"] == 20
    assert result["classification"]["groupsAttempted"] == 20
    assert result["classification"]["groupsSuccessful"] == 1
    assert result["classification"]["groupsFailed"] == 19
    assert result["classification"]["rowCount"] == 3
    assert result["rawResponses"]["downloadDiscoveryReport"] is not None
