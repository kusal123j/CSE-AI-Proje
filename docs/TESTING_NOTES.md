# Testing Notes

Validation completed after applying the final corrected package to the current project copy.

## Commands run

```bash
npm ci --ignore-scripts
DATABASE_URL=postgresql://test:test@localhost:5432/test npm --prefix apps/backend run typecheck
DATABASE_URL=postgresql://test:test@localhost:5432/test npm --prefix apps/backend test
DATABASE_URL=postgresql://test:test@localhost:5432/test npm --prefix apps/backend run build
PYTHONPATH=apps/python-worker pytest -q apps/python-worker/tests
npm --prefix apps/mega-panel run typecheck
```

## Results

```text
Backend typecheck: passed
Backend tests: 29 passed / 0 failed
Backend build: passed
Python worker tests: 11 passed / 0 failed
Mega Panel typecheck: passed
```

## Test coverage added/confirmed

- HTTP/API A-Z letter list has 26 letters.
- Valid empty letters are treated as completed letters.
- HTTP/API fetcher avoids Playwright/Chromium and full-export-first logic.
- Per-letter raw JSON artifacts are saved.
- Multiple A-Z letter responses merge and deduplicate duplicate symbols.
- Loser percent sign correction remains fixed.
- Source guard blocks forbidden CSE tabs.
- Project integration tests verify app route, scheduler, schema, and env fetch mode.
