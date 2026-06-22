# CSE Company Intelligence Runbook

This runbook covers the corrected company-intelligence importer for the CSE AI Research Assistant.

## Scope

Included:
- Company Profile enrichment for active symbols from the existing A-Z master importer.
- Financial reports discovery for annual, quarterly/interim, and other reports.
- Announcement discovery by symbol plus start date and end date.
- Latest-price bulk polling through the CSE latest price flow.
- PDF/document bridge to `documents.cse_company_id` and `documents.cse_security_id`.

Excluded:
- Charts.
- Playwright/Chromium/browser automation.
- Third-party unofficial package dependency.

## Recommended operating flow

1. Run or verify the A-Z listed-company importer first.
2. Run a test profile batch from Mega Panel: Company Intelligence → Run test batch 25.
3. Run all company profiles: Company Intelligence → Run all companies.
4. Run financial reports: Financial Reports → Run all companies.
5. Run announcements by date range: Company Announcements → select dates → Run all companies.
6. Enable latest-price polling only after the backend and worker are healthy.

## Scheduler environment variables

```env
CSE_COMPANY_PROFILE_SCHEDULER_ENABLED=false
CSE_COMPANY_PROFILE_REFRESH_HOURS=6

CSE_COMPANY_FINANCIAL_REPORTS_SCHEDULER_ENABLED=false
CSE_COMPANY_FINANCIAL_REPORTS_HOUR=18
CSE_COMPANY_FINANCIAL_REPORTS_MINUTE=0
CSE_COMPANY_FINANCIAL_REPORTS_WEEKDAYS_ONLY=true

CSE_COMPANY_ANNOUNCEMENTS_SCHEDULER_ENABLED=false
CSE_COMPANY_ANNOUNCEMENTS_HOUR=18
CSE_COMPANY_ANNOUNCEMENTS_MINUTE=30
CSE_COMPANY_ANNOUNCEMENTS_WEEKDAYS_ONLY=true
CSE_COMPANY_ANNOUNCEMENTS_LOOKBACK_DAYS=7

CSE_LATEST_PRICE_POLLER_ENABLED=false
CSE_LATEST_PRICE_POLL_INTERVAL_MS=180000
CSE_LATEST_PRICE_WEEKDAYS_ONLY=true
CSE_MARKET_OPEN_TIME=10:30
CSE_MARKET_CLOSE_TIME=14:30
```

## Manual endpoints

```http
POST /api/cse/import/company-profiles/run
POST /api/cse/import/company-financials/run
POST /api/cse/import/company-announcements/run
POST /api/cse/import/latest-prices/run
```

Examples:

```json
{ "symbol": "AFSL.N0000" }
```

```json
{ "startDate": "2024-01-01", "endDate": "2026-06-22" }
```

## Source safety

All report/announcement PDF URLs are checked before document creation. Only `cse.lk`, `www.cse.lk`, and `cdn.cse.lk` PDF URLs are allowed. Invalid or non-CSE URLs are skipped from the document queue and saved as warnings instead of crashing the import.

## Monitoring pages

- `/company-profiles`
- `/company-profiles/[symbol]`
- `/company-financial-reports`
- `/company-announcements`
- `/latest-prices`

## Known validation note

The sandbox cannot perform live CSE API calls. The corrected package includes fixture-based tests and parser checks; production should capture and review live payload fixtures before enabling scheduled all-company jobs.
