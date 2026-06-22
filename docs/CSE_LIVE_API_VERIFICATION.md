# CSE Live API Verification

Use this workflow before production rollout and whenever CSE changes its web/API payload shape.

```bash
cd <project-root>
python apps/python-worker/scripts/verify_cse_live_endpoints.py \
  --symbols AFSL.N0000 LOLC.N0000 COMB.N0000 JKH.N0000 BIL.N0000 \
  --output-dir apps/python-worker/tests/fixtures/cse/live_verified
```

The verifier uses lightweight HTTP requests only. It does not use Playwright, Chromium, Selenium, or any unofficial third-party repository code.

It checks these CSE-facing endpoints:

- `companyInfoSummery`
- `getFinancialAnnouncement`
- `approvedAnnouncement`
- `todaySharePrice`
- `marketStatus`

Expected outputs:

- raw JSON response captures per endpoint/symbol
- `CSE_LIVE_API_VERIFICATION_REPORT.json`
- `CSE_LIVE_API_VERIFICATION_REPORT.md`

If any endpoint fails or shape changes, keep the raw response, update the relevant parser/normalizer, and rerun the Python importer tests before enabling the scheduler.
