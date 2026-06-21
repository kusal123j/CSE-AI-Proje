# Frontend Architecture — CSE Mega Control Panel

## App location

```txt
apps/mega-panel
```

The panel is isolated from the backend and is not the final SaaS user frontend.

## Stack

- Next.js App Router.
- TypeScript.
- Tailwind CSS.
- Recharts.
- TanStack Table foundation.
- Vitest for node-only API and logic tests.

## Routing

```txt
/                    Dashboard Overview
/cse-import          CSE Import Control
/fetch-runs          Fetch Runs
/fetch-runs/[id]     Fetch Run Details
/companies           Companies
/securities          Securities/Symbols
/daily-snapshots     Daily Market Snapshots
/market-analytics    Market Analytics
/raw-logs            Raw Data / Logs
/ai-playground       Future AI/RAG Playground Placeholder
```

## Layout

`AppShell` wraps all pages with:

- Desktop sidebar.
- Mobile drawer sidebar.
- Topbar system status.
- Main content area.

The mobile drawer is implemented without adding a heavy UI dependency.

## API design

Read-only requests go through:

```txt
GET /api/cse/proxy/[...path]
```

Write/import action goes through:

```txt
POST /api/cse/import/run
```

The browser never receives the CSE import secret. The secret is read only by Next.js server route handlers.

## Error handling

The API client normalizes:

- Success envelopes.
- Backend 404/missing endpoint states.
- Backend 500 errors.
- Invalid/non-JSON backend responses.
- Network failures.

## Testing

Frontend tests cover:

- API client success and error states.
- Missing backend endpoint metadata.
- Dashboard formatting helpers.
- A-Z progress status derivation without requiring React rendering.
