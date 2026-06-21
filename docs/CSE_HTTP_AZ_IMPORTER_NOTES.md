# CSE HTTP/API A-Z Importer Notes

## Confirmed source rule

The only allowed source context is:

```text
https://www.cse.lk/listed-entities/listed-company-directory?page=ALPHABETICAL
```

The importer must not fetch separate CSE tabs such as Gainers, Losers, Turnover, Trade Volume, Share Volume, Date Listed, or Type of Issue.

## Confirmed fetch rule

The importer uses lightweight backend/Python HTTP/API fetching only:

1. Validate the allowed ALPHABETICAL source URL.
2. Resolve the same-site ALPHABETICAL endpoint.
3. Fetch records for `A` through `Z` one letter at a time.
4. Save one raw JSON artifact per letter.
5. Normalize rows.
6. Deduplicate and validate by symbol/security.
7. Save merged normalized JSON and validation reports.
8. Promote to PostgreSQL only if validation passes.

No Playwright, Chromium, Selenium, or real browser automation is part of this importer.

## Promotion rule

A failed or partial import is never promoted to live CSE tables. The previous successful data remains active and visible with its last successful timestamp.
