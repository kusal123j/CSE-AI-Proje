# CSE Daily Market Summary Importer

## Purpose

Adds a market-level Daily Market Summary import for:

```text
https://www.cse.lk/equity/daily-market-summary
```

This importer is intentionally separate from company/security daily snapshots. It stores one row per trading date in `cse_daily_market_summaries` and keeps company-level Trade Summary data in `cse_daily_market_snapshots`.

## Fetch strategy

- Primary strategy: Python HTTP call to the CSE Daily Market Summary API-style endpoint.
- Fallback strategy: parse the HTML tables from `/equity/daily-market-summary`.
- Merge strategy: if the API returns only today values and misses previous-day values, the importer parses HTML and merges API + HTML.
- Browser automation: disabled.
- Playwright/Chromium: not used.

## API complete vs partial behavior

The importer accepts API-only data only when all hard required fields are present, including the key previous-day values used for daily-change analytics.

```text
API complete -> activeFetchStrategy = api
API partial  -> activeFetchStrategy = api-partial-html-merge
API failed   -> activeFetchStrategy = html
HTML fixture -> activeFetchStrategy = html-fixture
```

When the API is partial, API values are kept where present and the HTML table supplies missing previous-day/context fields. The raw payload records both API and HTML artifacts plus `apiMissingRequiredFields`.

## Saved sections

The parser normalizes these CSE table sections:

- Price Indices
- Equity
- Debt
- Market
- Holdings in CDS

## Backend endpoints

```text
POST /api/cse/import/daily-market-summary/run
GET  /api/cse/daily-market-summary/latest
GET  /api/cse/daily-market-summary?date=YYYY-MM-DD
GET  /api/cse/daily-market-summary/history?from=YYYY-MM-DD&to=YYYY-MM-DD
```

## Python worker endpoint

```text
POST /cse/import/daily-market-summary
```

## Scheduler

Scheduler config is present but disabled by default:

```text
CSE_DAILY_MARKET_SUMMARY_SCHEDULER_ENABLED=false
CSE_DAILY_MARKET_SUMMARY_HOUR=16
CSE_DAILY_MARKET_SUMMARY_MINUTE=15
CSE_DAILY_MARKET_SUMMARY_WEEKDAYS_ONLY=true
```

## Hard validation fields

These fields must exist, or the import fails before saving to PostgreSQL:

```text
tradingDate
aspiToday
aspiPrevious
spSl20Today
spSl20Previous
equityTurnoverToday
equityTurnoverPrevious
marketCapToday
marketCapPrevious
listedCompaniesToday
tradedCompaniesToday
```

The backend repeats this validation before DB upsert, so a bad Python response cannot silently write a low-quality row.

## Warning-only fields

Optional fields produce warnings instead of blocking the import:

```text
astriToday / astriPrevious
triSpSl20Today / triSpSl20Previous
CDS holdings
corporate/government debt
PER / PBV / DY
foreign/domestic sub-breakdowns
```

## Raw audit data

Each import saves:

- raw response JSON
- normalized JSON
- validation report
- checksum
- warnings
- source URL
- fetch strategy
- active fetch strategy

## Admin troubleshooting

If admin sees warnings in the Mega Panel card:

1. Check `activeFetchStrategy`. `api-partial-html-merge` means the API was incomplete but HTML completed the row.
2. Check warning list for optional missing fields.
3. If status is failed, inspect the validation report; hard fields are required because the AI/dashboard need reliable daily-change context.

## AI usage

This data should be used as market context for source-backed research summaries. It must not be used to generate buy/sell signals.
