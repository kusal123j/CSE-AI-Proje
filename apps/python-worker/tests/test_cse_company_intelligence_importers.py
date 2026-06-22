import json
from pathlib import Path

from app import cse_announcements_importer as announcements
from app import cse_financial_reports_importer as reports
from app import cse_latest_price_importer as prices

FIXTURES = Path(__file__).parent / 'fixtures' / 'cse'


def load_fixture(name: str):
    return json.loads((FIXTURES / name).read_text())


def test_latest_price_importer_normalizes_bulk_today_share_price(monkeypatch):
    latest_payload = load_fixture('latest_prices_today.json')
    monkeypatch.setattr(prices, '_post_api', lambda api_url, data=None: {'marketStatus': 'OPEN'} if 'marketStatus' in api_url else latest_payload)

    result = prices.run_latest_prices_import('https://www.cse.lk/api/todaySharePrice', 'https://www.cse.lk/api/marketStatus')

    assert result['fetchMode'] == 'python-http'
    assert result['browserAutomationEnabled'] is False
    assert result['prices'][0]['symbol'] == 'AFSL.N0000'
    assert result['prices'][0]['lastTradedPrice'] == 100.25


def test_financial_reports_importer_classifies_annual_and_interim(monkeypatch):
    monkeypatch.setattr(reports, '_post_api', lambda api_url, data: load_fixture('financial_reports_afsl.json'))

    result = reports.run_financial_reports_import('AFSL.N0000', 'https://www.cse.lk/api/getFinancialAnnouncement')
    types = {item['reportType'] for item in result['reports']}

    assert result['fetchMode'] == 'python-http'
    assert result['browserAutomationEnabled'] is False
    assert 'ANNUAL_REPORT' in types
    assert 'INTERIM_REPORT' in types
    assert all(item['pdfUrl'].startswith('https://cdn.cse.lk/') for item in result['reports'])
    assert all('originalPdfUrl' in item for item in result['reports'])
    assert reports.normalize_cse_pdf_url('https://www.cse.lk/api/cmt/upload_report_file/510_1781521818535.pdf') == 'https://cdn.cse.lk/cmt/upload_report_file/510_1781521818535.pdf'
    assert reports.normalize_cse_pdf_url('https://evil.example/cmt/upload_report_file/510_1781521818535.pdf') is None
    assert reports.normalize_cse_pdf_url('javascript:alert(1)') is None


def test_announcements_importer_preserves_date_range_and_pdf(monkeypatch):
    monkeypatch.setattr(announcements, '_post_api', lambda api_url, data: load_fixture('announcements_afsl.json'))

    result = announcements.run_announcements_import('AFSL.N0000', '2025-01-01', '2025-12-31', 'https://www.cse.lk/api/approvedAnnouncement')

    assert result['startDate'] == '2025-01-01'
    assert result['endDate'] == '2025-12-31'
    assert result['announcements'][0]['symbol'] == 'AFSL.N0000'
    assert result['announcements'][0]['pdfUrl'].endswith('.pdf')
    assert result['announcements'][0]['pdfUrl'].startswith('https://cdn.cse.lk/')
    assert 'originalPdfUrl' in result['announcements'][0]
    assert announcements.normalize_cse_pdf_url('/api/cmt/upload_report_file/510_1781521818535.pdf') == 'https://cdn.cse.lk/cmt/upload_report_file/510_1781521818535.pdf'
    assert announcements.normalize_cse_pdf_url('https://cdn.cse.lk/cmt/upload_report_file/510_1781521818535.pdf') == 'https://cdn.cse.lk/cmt/upload_report_file/510_1781521818535.pdf'
    assert announcements.normalize_cse_pdf_url('data:application/pdf;base64,abcd') is None
