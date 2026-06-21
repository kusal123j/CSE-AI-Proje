# CSE Data Source Rules

## Allowed source context

```text
https://www.cse.lk/listed-entities/listed-company-directory?page=ALPHABETICAL
```

## Allowed fetch method

The project now uses lightweight backend/Python HTTP/API/export-style fetching. The importer must fetch ALPHABETICAL data one letter at a time from `A` to `Z` and must not use Playwright/Chromium browser automation.

A full-export-first strategy is not allowed because the system does not support full export.

## Forbidden sources

The importer must not fetch these separate CSE tabs/pages as source data:

```text
DATE LISTED
TYPE OF ISSUE
TURNOVER
TRADE VOLUME
SHARE VOLUME
GAINERS
LOSERS
```

## Analytics rule

The system calculates internally:

```text
Gainers
Losers
Top turnover
Top trade volume
Top share volume
```

No separate ranking tabs are fetched.
