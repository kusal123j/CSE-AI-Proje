# README APPLY FIRST

This corrected package implements and hardens the separate CSE Trade Summary daily market importer while preserving the existing A-Z ALPHABETICAL company/security master importer.

## What changed

- Separate backend route: `POST /api/cse/import/trade-summary/run`.
- Separate Python worker route: `POST /cse/import/trade-summary`.
- Trade Summary snapshot fields: previous close, open, high, low, last trade, share/trade volume, change, Watch List flag.
- Robust fallback order: API first, configured CSV, discovered CSV/export link, then HTML table fallback.
- Stronger Watch List detection and tracing.
- Mega Panel has separate A-Z and Trade Summary import controls.

## Important rule

A-Z remains the company/security master source. Trade Summary is only the daily market activity/statistics source. No Playwright/Chromium browser automation is used.

## Files/reports

Read `MODIFIED_ONLY_MANIFEST.md`, `FILE_COMPARISON_REPORT.md`, `DIFF_SUMMARY.md`, and `TEST_RESULTS.md` before applying.
