from pathlib import Path


def test_live_verification_script_covers_required_endpoints_without_browser_automation():
    script = Path(__file__).resolve().parents[1] / 'scripts' / 'verify_cse_live_endpoints.py'
    text = script.read_text(encoding='utf-8')
    for endpoint in ['companyInfoSummery', 'getFinancialAnnouncement', 'approvedAnnouncement', 'todaySharePrice', 'marketStatus']:
        assert endpoint in text
    assert 'playwright' not in text.lower()
    assert 'chromium' not in text.lower()
    assert 'selenium' not in text.lower()
