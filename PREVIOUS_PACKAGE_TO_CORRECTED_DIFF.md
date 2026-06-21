# Previous Package to Corrected Package Difference

Compared with the previous GICS package, this corrected package focuses on reliability fixes rather than broad new features.

## Main differences

- Python GICS parser rewritten to parse the real supplied CSE Summary and Classification HTML snapshots correctly.
- Added `tests/test_cse_gics_importer.py` and fixture HTML files for Summary, Indices, and Classification.
- Backend GICS validation now explicitly fails when the Summary industry-group mapping table is empty.
- Backend writes dedicated GICS validation, download-discovery, and group-fetch reports.
- GICS service duplicate `indexRows` property removed.

## Intended outcome

The corrected package is designed to pass the specific failure points found in the independent review and block unsafe partial promotion.
