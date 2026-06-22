# Apply First - Full Project Package

This archive is the full CSE AI Research Assistant project with the final CSE Company Intelligence implementation already applied. It is not a modified-only patch package.

## Included feature scope

- Company profile enrichment importer.
- Financial reports importer for annual, quarterly/interim, and other reports.
- Company announcements importer with symbol + start date + end date.
- Latest price bulk poller with market-status-first scheduled flow.
- Company profile, financial reports, announcements, latest price, import-run detail, retry failed symbols, and retry document controls in Mega Panel.
- CSE/CDN PDF source guard before report/announcement document creation.
- Live CSE endpoint verification script.

## Explicitly not included

- No Charts importer.
- No Playwright.
- No Chromium.
- No browser automation.
- No third-party unofficial CSE repo dependency.

## Notes

The original project files are included together with all corrected modified files. Generated dependency folders such as `node_modules`, Python cache folders, and pytest caches are intentionally excluded.
