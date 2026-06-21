# Testing Notes

Validation completed after applying the package to the current project copy.

## Commands run

```bash
npm install --ignore-scripts
DATABASE_URL=postgresql://user:pass@localhost:5432/db npm --prefix apps/backend run typecheck
DATABASE_URL=postgresql://user:pass@localhost:5432/db npm --prefix apps/backend test
```

## Results

```text
TypeScript typecheck: passed
Backend tests: 21 passed / 0 failed
```

## Test coverage added

- Browser A-Z letter list has 26 letters.
- Browser fetcher source avoids direct backend HTTP export requests.
- Export parser handles downloaded CSV files.
- Multiple letter files merge and deduplicate duplicate symbols.
- Loser percent sign correction remains fixed.
- Source guard blocks forbidden CSE tabs.
- Project integration tests verify app route, scheduler, schema, and env fetch mode.
