import pytest

from app.cse_http_importer import (
    CseImportParseError,
    dedupe_rows,
    normalize_number,
    parse_alphabetical_html,
)


SAMPLE_HTML = """
<html>
  <body>
    <table>
      <thead>
        <tr>
          <th>Company Name</th>
          <th>Symbol</th>
          <th>Last Traded Price (Rs)</th>
          <th>Trade Volume</th>
          <th>Share Volume</th>
          <th>Turnover(Rs)</th>
          <th>Change(Rs)</th>
          <th>Change (%)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><a href="/company-profile?symbol=AFSL.N0000">ABANS FINANCE PLC</a></td>
          <td>AFSL.N0000</td>
          <td>95.30</td>
          <td>10</td>
          <td>576</td>
          <td>54,899.40</td>
          <td>-3.90</td>
          <td>3.93</td>
        </tr>
        <tr>
          <td>ABANS ELECTRICALS PLC</td>
          <td>ABAN.N0000</td>
          <td>1,201.25</td>
          <td>20</td>
          <td>209</td>
          <td>250,753.50</td>
          <td>+10.75</td>
          <td>0.90</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>
"""


def test_parse_alphabetical_html_normalizes_market_rows():
    rows = parse_alphabetical_html(SAMPLE_HTML)

    assert len(rows) == 2
    loser = next(row for row in rows if row.symbol == "AFSL.N0000")
    assert loser.company_name == "ABANS FINANCE PLC"
    assert loser.profile_url == "https://www.cse.lk/company-profile?symbol=AFSL.N0000"
    assert loser.last_traded_price == 95.30
    assert loser.trade_volume == 10
    assert loser.share_volume == 576
    assert loser.turnover == 54899.40
    assert loser.change_amount == -3.90
    assert loser.change_percent == -3.93


def test_normalize_number_handles_cse_formatting():
    assert normalize_number("1,234.50") == 1234.50
    assert normalize_number("+3.25%") == 3.25
    assert normalize_number("-") is None
    assert normalize_number("N/A") is None


def test_dedupe_rows_keeps_one_row_per_symbol():
    rows = parse_alphabetical_html(SAMPLE_HTML)
    deduped = dedupe_rows([rows[0], rows[1], rows[0]])

    assert [row.symbol for row in deduped] == ["ABAN.N0000", "AFSL.N0000"]


def test_parse_alphabetical_html_fails_clearly_for_empty_structure():
    with pytest.raises(CseImportParseError, match="No listed-company rows"):
        parse_alphabetical_html("<html><body><p>No table rows here</p></body></html>")
