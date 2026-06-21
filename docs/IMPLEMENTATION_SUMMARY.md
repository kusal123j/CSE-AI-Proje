# Implementation Summary — HTTP/API A-Z CSE ALPHABETICAL Importer

## Scope

This update implements the CSE ALPHABETICAL market-universe importer for the TypeScript/PostgreSQL backend using a lightweight backend/Python HTTP/API workflow.

## Current rules

- No Playwright.
- No Chromium.
- No real browser automation.
- No full-export-first strategy.
- Fetch ALPHABETICAL data one letter at a time from A to Z.
- Deduplicate by symbol/security, not company name.
- Write candidate data to import-run scoped staging tables.
- Validate before promotion.
- Keep previous successful live data if the new import fails.

## Main changes

- Added non-blocking manual import start: `POST /api/cse/import/run` returns a run ID immediately.
- Added separated job timeout and per-letter timeout settings.
- Added per-letter retry tracking in the Python HTTP importer.
- Added raw per-letter JSON artifact storage.
- Added import-run staging tables for companies, securities, and market snapshots.
- Promotes staged rows into live tables only after validation passes.
- Added freshness metadata to CSE data APIs.
- Kept scheduler disabled by default but ready for daily scheduled imports.
- Kept manual import protected by `x-cse-import-secret` unless explicitly opened by env.

## Not touched

- AI/RAG modules
- Qdrant code
- annual-report pipeline
- payments
- authentication
- unrelated backend modules
