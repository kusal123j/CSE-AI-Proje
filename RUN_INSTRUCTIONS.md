# RUN INSTRUCTIONS

## Docker/dev startup

Use your normal Docker Compose/Coolify flow. The new importer uses the existing backend and Python worker services.

## Required env highlights

```env
CSE_TRADE_SUMMARY_ENABLED=true
CSE_TRADE_SUMMARY_SOURCE_URL=https://www.cse.lk/equity/trade-summary
CSE_TRADE_SUMMARY_SCHEDULER_ENABLED=false
CSE_TRADE_SUMMARY_HOUR=15
CSE_TRADE_SUMMARY_MINUTE=45
CSE_TRADE_SUMMARY_WEEKDAYS_ONLY=true
CSE_TRADE_SUMMARY_TIMEOUT_SECONDS=90
CSE_TRADE_SUMMARY_CSV_URL=
```

`CSE_TRADE_SUMMARY_CSV_URL` is optional. If empty, the Python worker tries to discover a CSV/export/download link from the Trade Summary page before HTML fallback.

## Manual run

```bash
curl -X POST http://localhost:5000/api/cse/import/trade-summary/run \
  -H "Content-Type: application/json" \
  -d "{}"
```

Then check Mega Panel → CSE Import → Latest import run, Daily Snapshots, and Market Analytics.

Expected on a normal trading day: imported rows normally above 100. Watch List count may be 0 if the live API/export does not expose watch-list status and HTML fallback is not used.
