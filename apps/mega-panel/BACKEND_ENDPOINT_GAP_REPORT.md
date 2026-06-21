# Backend Endpoint Gap Report — Corrected Package

## Existing/used endpoints

The Mega Panel uses these CSE backend endpoints when available:

```txt
GET  /api/cse/summary
GET  /api/cse/import/config
POST /api/cse/import/alphabetical/run
GET  /api/cse/import/runs
GET  /api/cse/import/runs/:id
GET  /api/cse/import/runs/:id/raw-summary
GET  /api/cse/companies
GET  /api/cse/securities
GET  /api/cse/market/latest-date
GET  /api/cse/market/daily
GET  /api/cse/market/gainers
GET  /api/cse/market/losers
GET  /api/cse/market/top-turnover
GET  /api/cse/market/top-trade-volume
GET  /api/cse/market/top-share-volume
```

## Security correction

The frontend generic proxy is now read-only. It no longer forwards arbitrary POST/PUT/PATCH/DELETE requests to the backend. This prevents accidental secret-backed write access through a broad proxy.

## Still missing for perfect production behavior

### 1. True real-time A-Z import progress

Current UI reconstructs status from latest fetch-run metadata, warnings, and raw file summary. It does not receive streaming per-letter worker events yet.

Recommended future options:

Option A — simple JSONB approach:

```txt
letter_status_json JSONB column in cse_fetch_runs
```

Option B — normalized table:

```txt
cse_fetch_run_letters
  run_id
  letter
  status
  started_at
  finished_at
  raw_artifact_path
  parsed_row_count
  error_message
```

Recommended statuses:

```txt
Pending
Downloading
Downloaded
Parsed
Failed
Skipped
```

### 2. Full raw file browser

The panel can show the raw run path and raw summary where backend support exists. A complete file browser would need safe backend listing/download endpoints with access control.

### 3. AI/RAG endpoint integration

The AI playground is intentionally a placeholder. No AI/RAG backend code was touched.

### 4. Production authentication

This package assumes internal/local controlled usage. A future production panel should add role-based access protection before exposing it on a public domain.
