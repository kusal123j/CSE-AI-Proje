# Environment Notes

Relevant CSE import variables:

```env
CSE_IMPORT_MODE=python-http
CSE_IMPORT_FETCH_MODE=python-http
CSE_IMPORT_SOURCE_URL=https://www.cse.lk/listed-entities/listed-company-directory?page=ALPHABETICAL
CSE_LISTED_COMPANY_DIRECTORY_URL=https://www.cse.lk/listed-entities/listed-company-directory?page=ALPHABETICAL
CSE_IMPORT_RAW_STORAGE_DIR=storage/raw/cse/alphabetical
CSE_IMPORT_ARTIFACT_STORAGE_DIR=storage/raw/cse/alphabetical
CSE_IMPORT_MIN_EXPECTED_ROWS=250
CSE_IMPORT_MIN_COMPANIES=280
CSE_IMPORT_MIN_SECURITIES=280
CSE_IMPORT_TIMEOUT_SECONDS=30
CSE_IMPORT_JOB_TIMEOUT_SECONDS=300
CSE_IMPORT_LETTER_TIMEOUT_SECONDS=30
CSE_IMPORT_MAX_RETRIES=3
CSE_IMPORT_RETRY_COUNT=3
CSE_IMPORT_STALE_AFTER_HOURS=36
CSE_IMPORT_USER_AGENT=Mozilla/5.0 compatible CSE Research Assistant Importer
CSE_IMPORT_INTERNAL_SECRET=change-this-long-random-secret
CSE_IMPORT_ALLOW_UNPROTECTED_MANUAL_RUN=false
CSE_IMPORT_SCHEDULER_ENABLED=false
CSE_IMPORT_HOUR=16
CSE_IMPORT_MINUTE=0
CSE_IMPORT_WEEKDAYS_ONLY=true
CSE_IMPORT_SCHEDULER_INTERVAL_MS=60000
```

The importer is intentionally no-browser: no Playwright, Chromium, Selenium, or real browser automation.

The supported fetch shape is A-Z letter-by-letter only. Full export is not supported.

Production artifact note: mount `CSE_IMPORT_ARTIFACT_STORAGE_DIR` as a persistent Docker/Coolify volume so raw per-letter artifacts survive container replacement.
