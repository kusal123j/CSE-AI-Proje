# CSE Import Retry Workflow

Full-market company-intelligence imports write per-symbol results into `cse_company_import_symbol_results`.

Operator endpoints:

- `GET /api/cse/import/runs/:id/symbol-results`
- `POST /api/cse/import/runs/:id/retry-failed`

Supported retry import types:

- `COMPANY_PROFILE`
- `FINANCIAL_REPORTS`
- `ANNOUNCEMENTS`
- `LATEST_PRICES`

For announcements, include `startDate` and `endDate` when retrying failed symbols for a specific disclosure window.

The retry flow creates a new import run and links it to the original run through `parent_run_id`. The original run is not modified.
