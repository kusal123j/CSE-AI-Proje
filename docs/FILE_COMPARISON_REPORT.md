# HTTP/API A-Z Package Content Comparison Report

Comparison method: SHA-256 file content hash, not file name or file size.

## Summary

This package is aligned with the updated project decision: lightweight backend/Python HTTP/API fetching, A-Z letter-by-letter only, no Playwright/Chromium, no full export.

## Main CSE import changes

- Non-blocking manual import start with immediate run ID response.
- Production-safe separated timeouts: whole import job vs per-letter HTTP request.
- Real per-letter retry with attempts and final error recording.
- Raw per-letter JSON artifacts.
- Import-run scoped staging tables.
- Validation gate before live promotion.
- Freshness metadata on CSE company/security/daily/ranking APIs.
- Configurable artifact storage directory.

## Scope confirmation

Only CSE import/backend/Python worker/Mega Panel CSE import observability/docs/env areas are intentionally changed. AI/RAG, Qdrant, PDF ingestion, authentication, and unrelated application modules are not intentionally changed.
