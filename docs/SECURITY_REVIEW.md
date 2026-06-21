# Security Review — CSE HTTP/API A-Z Importer

## Manual import protection

Manual import remains protected by secret header:

```http
x-cse-import-secret: <CSE_IMPORT_INTERNAL_SECRET>
```

If `CSE_IMPORT_INTERNAL_SECRET` is not configured and unprotected manual run is false, manual import is blocked.

## Source control

Only this source is allowed:

```text
https://www.cse.lk/listed-entities/listed-company-directory?page=ALPHABETICAL
```

Forbidden tabs are blocked by source guard tests.

## Import method

The active importer is a lightweight backend/Python HTTP/API importer. It requests the CSE ALPHABETICAL data one letter at a time from A to Z and does not use Playwright, Chromium, Selenium, or real browser automation.

The importer must not use Date Listed, Type of Issue, Turnover, Trade Volume, Share Volume, Gainers, or Losers as source tabs. Those analytics must be calculated internally from the ALPHABETICAL import data.

## Scheduler

Scheduler is disabled by default:

```env
CSE_IMPORT_SCHEDULER_ENABLED=false
```

Enable it explicitly in production after the artifact storage volume and database migrations are ready.
