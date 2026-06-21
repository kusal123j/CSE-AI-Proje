# Apply First - CSE HTTP/API A-Z ALPHABETICAL Importer

This package keeps the CSE import path lightweight: **no Playwright, no Chromium, no real browser automation**.

## What this package does

- Uses the official CSE ALPHABETICAL directory source URL as the allowed source context.
- Calls the CSE ALPHABETICAL HTTP/API endpoint letter by letter from `A` to `Z`.
- Does not use a full-export-first path because the system does not support full export.
- Saves raw per-letter JSON artifacts plus merged normalized JSON and validation reports.
- Validates all 26 letters, row counts, company count, symbol/security count, missing fields, and duplicate symbols before promotion.
- Promotes to PostgreSQL only after validation passes.
- Keeps previous successful live data if the latest import fails.
- Stores company master data, security/symbol data, and daily market snapshots separately.
- Calculates gainers, losers, turnover ranking, trade volume ranking, and share volume ranking internally from ALPHABETICAL snapshots.

## Required setup

```bash
npm install
pip install -r apps/python-worker/requirements.txt
```

Set the CSE import mode and source:

```env
CSE_IMPORT_MODE=python-http
CSE_IMPORT_FETCH_MODE=python-http
CSE_IMPORT_SOURCE_URL=https://www.cse.lk/listed-entities/listed-company-directory?page=ALPHABETICAL
CSE_LISTED_COMPANY_DIRECTORY_URL=https://www.cse.lk/listed-entities/listed-company-directory?page=ALPHABETICAL
CSE_IMPORT_MIN_EXPECTED_ROWS=250
CSE_IMPORT_MIN_COMPANIES=280
CSE_IMPORT_MIN_SECURITIES=280
CSE_IMPORT_TIMEOUT_SECONDS=30
CSE_IMPORT_MAX_RETRIES=3
CSE_IMPORT_USER_AGENT=Mozilla/5.0 compatible CSE Research Assistant Importer
CSE_IMPORT_INTERNAL_SECRET=your-long-random-secret
```

Manual import route:

```http
POST /api/cse/import/alphabetical/run
x-cse-import-secret: your-long-random-secret
```

Alias route also exists:

```http
POST /api/cse/import/run
x-cse-import-secret: your-long-random-secret
```

Configuration route:

```http
GET /api/cse/import/config
```

## Validation commands

```bash
python -m pytest apps/python-worker/tests
DATABASE_URL=postgresql://user:pass@localhost:5432/db npm --prefix apps/backend run typecheck
DATABASE_URL=postgresql://user:pass@localhost:5432/db npm --prefix apps/backend test
```
