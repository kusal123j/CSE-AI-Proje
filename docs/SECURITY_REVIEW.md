# Security Review — CSE Browser A-Z Importer

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

## Browser automation

The browser opens only the ALPHABETICAL page and interacts with the A-Z letter buttons and Download button. The code does not call hidden export/API URLs directly.

## Scheduler

Scheduler is disabled by default:

```env
CSE_IMPORT_SCHEDULER_ENABLED=false
```
