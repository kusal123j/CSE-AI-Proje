from app.cse_trade_summary_importer import parse_decimal, parse_int, row_from_record, dedupe_rows, parse_html_table, discover_csv_download_url


def test_trade_summary_number_parsing_handles_commas_and_signs():
    assert parse_int("310,576") == 310576
    assert parse_decimal("+0.30") == 0.30
    assert parse_decimal("-0.10") == -0.10
    assert parse_decimal("1,172.25") == 1172.25


def test_trade_summary_row_from_record_normalizes_core_fields():
    row = row_from_record(
        {
            "Company": "ACCESS ENGINEERING PLC",
            "Symbol": "ael.n0000",
            "Share Volume": "310,576",
            "Trade Volume": "174",
            "Previous Close (Rs.)": "78.10",
            "Open (Rs.)": "78.30",
            "High (Rs.)": "78.30",
            "Low (Rs.)": "77.80",
            "Last Trade (Rs.)": "78.00",
            "Change (Rs.)": "-0.10",
            "Change (%)": "0.13",
            "direction": "down",
            "isWatchList": "false",
        }
    )
    assert row is not None
    assert row.company_name == "ACCESS ENGINEERING PLC"
    assert row.symbol == "AEL.N0000"
    assert row.share_volume == 310576
    assert row.trade_volume == 174
    assert row.previous_close == 78.10
    assert row.change_amount == -0.10
    assert row.change_percent == -0.13
    assert row.is_watch_list is False


def test_trade_summary_watch_list_detection_and_deduplication():
    row = row_from_record({"Company": "ACME PLC", "Symbol": "ACME.N0000", "isWatchList": "true"})
    assert row is not None
    assert row.is_watch_list is True
    deduped, deduped_count, duplicates = dedupe_rows([row, row])
    assert len(deduped) == 1
    assert deduped_count == 1
    assert duplicates == ["ACME.N0000"]


def test_trade_summary_html_fallback_detects_highlighted_watch_list_row():
    html = """
    <html><body><div>MARKET STATISTICS AS OF 19 JUN 2026, 02:48:59 PM</div>
    <table><thead><tr><th>Company</th><th>Symbol</th><th>Share Volume</th><th>Trade Volume</th><th>Last Trade (Rs.)</th></tr></thead>
    <tbody><tr class="bg-highlight-status"><td>ACME PRINTING PLC</td><td>ACME.N0000</td><td>2,056,964</td><td>282</td><td>5.20</td></tr></tbody></table>
    </body></html>
    """
    raw, rows, warnings, market_text = parse_html_table(html, "https://www.cse.lk/equity/trade-summary")
    assert rows[0].symbol == "ACME.N0000"
    assert rows[0].is_watch_list is True
    assert rows[0].share_volume == 2056964
    assert warnings == []
    assert market_text == "19 JUN 2026, 02:48:59 PM"
    assert raw["payload"]["htmlLength"] > 0


def test_trade_summary_watch_list_detection_from_status_text():
    row = row_from_record({"Company": "WATCHED PLC", "Symbol": "WTCH.N0000", "Status": "On Watch List"})
    assert row is not None
    assert row.is_watch_list is True
    assert row.watch_list_detection_source == "status_text:status"


def test_trade_summary_csv_download_discovery_from_html_links_and_scripts():
    html = """
    <html><body>
      <a href="/api/tradeSummary/download/csv">Download CSV</a>
      <script>window.extraExport = '/api/other/download.csv';</script>
    </body></html>
    """
    url = discover_csv_download_url(html, "https://www.cse.lk/equity/trade-summary")
    assert url == "https://www.cse.lk/api/tradeSummary/download/csv"


def test_trade_summary_html_fallback_preserves_watch_list_detection_source():
    html = """
    <html><body>
    <table><thead><tr><th>Company</th><th>Symbol</th><th>Status</th></tr></thead>
    <tbody><tr><td>ACME PRINTING PLC</td><td>ACME.N0000</td><td>Watch List</td></tr></tbody></table>
    </body></html>
    """
    _, rows, _, _ = parse_html_table(html, "https://www.cse.lk/equity/trade-summary")
    assert rows[0].is_watch_list is True
    assert rows[0].watch_list_detection_source == "status_text:status"
