# Apply First - CSE Python HTTP ALPHABETICAL Importer

This package removes the CSE listed-company Playwright/Chromium importer and replaces it with the Python HTTP-first importer.

## What this package does

- Fetches `https://www.cse.lk/listed-entities/listed-company-directory?page=ALPHABETICAL` with Python HTTP requests.
- Parses the returned HTML with BeautifulSoup/lxml.
- Validates and deduplicates listed-company rows by stock symbol.
- Returns normalized rows to the Node backend.
- Saves companies, securities, daily snapshots, and fetch-run logs into PostgreSQL through the existing backend import path.
- Calculates gainers, losers, turnover ranking, trade volume ranking, and share volume ranking internally from saved ALPHABETICAL snapshots.

No browser fallback is included.

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
