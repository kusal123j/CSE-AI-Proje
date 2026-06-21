# Correction Review Notes

The independent review found that the first package was architecturally useful but not final-safe because the GICS Summary and Classification parsers failed against the real supplied CSE HTML snapshots.

## Corrections applied

1. Fixed HTML table header detection so `<thead>` headers are used correctly and tbody data rows are never promoted to header rows.
2. Added explicit parser functions for Summary metrics, Summary group mapping, Indices, and Classification.
3. Added CSE-specific support for grouped headers, nested span/div/a cell content, sticky-column tables, empty cells, and numeric values with commas/percent signs.
4. Added download-discovery and group-fetch diagnostic reporting for Summary/Indices/Classification fetches.
5. Added GICS-specific Python tests using the provided CSE HTML snapshots.
6. Added backend GICS source guard and validation report tests.
7. Removed duplicate `indexRows` object property in the GICS service promotion payload.

## Operational note

The importer still avoids Playwright/Chromium. For non-default classification groups, it attempts lightweight HTTP/API/CSV/HTML candidate URLs and records detailed group fetch failures if the CSE frontend does not expose a direct lightweight endpoint. Strict backend validation prevents partial imports from being promoted silently.
