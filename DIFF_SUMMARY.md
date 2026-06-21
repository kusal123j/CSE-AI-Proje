# Diff Summary — Corrected CSE GICS Import Package

## Counts

- Modified files: 19
- Added files: 7
- Deleted files: 0
- Unchanged files: 217

## Key corrections

- Replaced fragile GICS HTML table parsing with a CSE-aware parser that uses `<thead>` rows only and no longer treats first data rows as headers.
- Added explicit parsers for GICS Summary metric rows, Summary group mapping rows, Industry Group Indices rows, and Classification rows.
- Added fixture-based Python tests using the supplied CSE HTML snapshots for Summary, Indices, and Classification.
- Added backend GICS validation/source-guard tests and stricter validation for zero summary mapping rows.
- Added backend artifact reports for validation, download discovery, and group fetch diagnostics.
- Preserved the separate `CSE_GICS` source family and did not merge with A–Z or Trade Summary.
- No Playwright/Chromium browser automation was added.
