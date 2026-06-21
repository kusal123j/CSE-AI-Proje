# README_APPLY_FIRST — Final Complete CSE Mega Control Panel Package

This package is built for your current original project state where you have **not yet applied any previous Mega Panel ZIP files**. Extract this ZIP at the project root and allow it to overwrite only the included paths.

## What this ZIP contains

- `apps/mega-panel/**` — new Next.js TypeScript internal Mega Control Panel.
- `package.json` and `package-lock.json` — workspace/scripts/dependency updates.
- Limited CSE backend files under `apps/backend/src/modules/cse/**` for summary/config/raw-summary support endpoints.
- Documentation and comparison reports.

## Important apply order

1. Back up your latest project first.
2. Extract this ZIP at the project root.
3. Allow files to overwrite the listed delta paths.
4. Run install and validation commands below.

## Install

```bash
npm install --ignore-scripts
```

## Required environment variables

Create `apps/mega-panel/.env.local` for local development:

```env
CSE_BACKEND_API_URL=http://localhost:5000
CSE_IMPORT_INTERNAL_SECRET=replace-with-your-real-backend-secret
NEXT_PUBLIC_MEGA_PANEL_NAME=CSE Mega Control Panel
```

Security rule: never place the import secret in a `NEXT_PUBLIC_*` variable. The browser calls the Next.js server route, and the server route attaches the backend secret.

## Run locally

```bash
npm run dev:backend
npm run dev:mega-panel
```

Mega Panel default URL:

```txt
http://localhost:3001
```

## Validate after applying

```bash
npm --prefix apps/mega-panel run typecheck
npm --prefix apps/mega-panel run test
npm --prefix apps/mega-panel run build
npm --prefix apps/backend run typecheck
DATABASE_URL=postgres://user:pass@localhost:5432/db npm --prefix apps/backend test
```

## Security correction included

The generic CSE proxy is read-only. It only supports `GET`. Write actions are blocked with `405 Method Not Allowed`. The import trigger remains a dedicated route:

```txt
POST /api/cse/import/run
```

That route safely calls the backend import endpoint server-side.

## Testing correction included

The frontend tests are now node-only Vitest tests for API client behavior, A-Z progress logic, API error metadata, and formatting helpers. This avoids the previous React render-test dependency mismatch in workspace installs.

## Dependency audit note

`npm audit` may report advisories from dependency chains including framework/transitive dependencies and the existing `xlsx` package. This package does not force unrelated parser or framework upgrades because that could break the existing CSE import behavior. Review dependency upgrades separately before production deployment.

## Docker / Existing Infra Run

This Docker-ready package adds a `mega-panel` service to `infra/docker-compose.yml`.

Add the following to your root `.env`:

```env
CSE_BACKEND_API_URL=http://backend:5000
CSE_IMPORT_INTERNAL_SECRET=your-real-backend-cse-import-secret
NEXT_PUBLIC_MEGA_PANEL_NAME=CSE Mega Control Panel
```

Then run from the project root:

```bash
docker compose -f infra/docker-compose.yml up --build
```

Open:

```txt
http://localhost:3001
```

The import secret is passed only to the Next.js server container and is not exposed as a `NEXT_PUBLIC_*` browser variable.
