import pytest
from dataclasses import replace

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

class _FakeResponse:
    def __init__(self, status_code, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload
        self.text = text or ("{}" if payload is not None else "")

    def json(self):
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


class _FakeClient:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = 0

    def post(self, *_args, **_kwargs):
        self.calls += 1
        return self.responses.pop(0)


def test_fetch_one_letter_retries_transient_status(monkeypatch):
    from app import cse_http_importer as importer

    monkeypatch.setattr(importer, "settings", replace(importer.settings, cse_import_retry_count=2))
    client = _FakeClient([
        _FakeResponse(500, text="temporary"),
        _FakeResponse(200, {"reqAlphabetical": [{"Company Name": "ABANS PLC", "Symbol": "ABAN.N0000"}]}),
    ])

    raw, result, rows, warnings = importer.fetch_one_alphabetical_letter(
        client,
        "https://www.cse.lk/api/alphabetical",
        "https://www.cse.lk/listed-entities/listed-company-directory?page=ALPHABETICAL",
        "A",
    )

    assert client.calls == 2
    assert raw["attempts"] == 2
    assert result["status"] == "success"
    assert result["attempts"] == 2
    assert rows[0].symbol == "ABAN.N0000"
    assert warnings


def test_fetch_one_letter_fails_after_retry_limit(monkeypatch):
    from app import cse_http_importer as importer

    monkeypatch.setattr(importer, "settings", replace(importer.settings, cse_import_retry_count=2))
    client = _FakeClient([_FakeResponse(500, text="temporary"), _FakeResponse(500, text="still down")])

    _raw, result, rows, warnings = importer.fetch_one_alphabetical_letter(
        client,
        "https://www.cse.lk/api/alphabetical",
        "https://www.cse.lk/listed-entities/listed-company-directory?page=ALPHABETICAL",
        "M",
    )

    assert client.calls == 2
    assert result["status"] == "failed"
    assert result["attempts"] == 2
    assert rows == []
    assert warnings


def test_fetch_one_letter_accepts_valid_empty_payload(monkeypatch):
    from app import cse_http_importer as importer

    monkeypatch.setattr(importer, "settings", replace(importer.settings, cse_import_retry_count=2))
    client = _FakeClient([_FakeResponse(200, {"reqAlphabetical": []})])

    raw, result, rows, warnings = importer.fetch_one_alphabetical_letter(
        client,
        "https://www.cse.lk/api/alphabetical",
        "https://www.cse.lk/listed-entities/listed-company-directory?page=ALPHABETICAL",
        "Z",
    )

    assert client.calls == 1
    assert raw["attempts"] == 1
    assert result["status"] == "empty"
    assert result["rowCount"] == 0
    assert rows == []
    assert warnings == []


def test_run_http_import_counts_valid_empty_letters_as_successful(monkeypatch):
    from app import cse_http_importer as importer

    rows = parse_alphabetical_html(SAMPLE_HTML)
    letters = [chr(codepoint) for codepoint in range(ord("A"), ord("Z") + 1)]
    letter_results = [
        {"letter": letter, "status": "success" if letter == "A" else "empty", "rowCount": 2 if letter == "A" else 0, "attempts": 1, "lastError": None}
        for letter in letters
    ]
    raw_responses = [{"letter": item["letter"], "statusCode": 200, "payload": {"reqAlphabetical": []}, "attempts": 1} for item in letter_results]

    monkeypatch.setattr(
        importer,
        "fetch_alphabetical_api_rows",
        lambda _url: (rows, [], raw_responses, letter_results, 0, []),
    )

    result = importer.run_http_import("https://www.cse.lk/listed-entities/listed-company-directory?page=ALPHABETICAL")

    assert result["lettersAttempted"] == 26
    assert result["lettersSuccessful"] == 26
    assert result["lettersFailed"] == 0
    assert result["letterResults"][-1]["status"] == "empty"
