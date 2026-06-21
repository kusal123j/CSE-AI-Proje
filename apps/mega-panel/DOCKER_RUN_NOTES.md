# Mega Panel Docker Run Notes

This package includes Docker integration for the internal CSE Mega Control Panel.

## What was added

- `apps/mega-panel/Dockerfile`
- `apps/mega-panel/.dockerignore`
- `infra/docker-compose.yml` updated with a new `mega-panel` service

No AI/RAG, payment, auth, Python worker, database schema, or storage module changes are included for Docker support.

## Required environment variables

Add these to the root `.env` file used by `infra/docker-compose.yml`:

```env
CSE_BACKEND_API_URL=http://backend:5000
CSE_IMPORT_INTERNAL_SECRET=your-real-backend-cse-import-secret
NEXT_PUBLIC_MEGA_PANEL_NAME=CSE Mega Control Panel
```

If your backend already uses `CSE_IMPORT_SECRET`, use the same value for `CSE_IMPORT_INTERNAL_SECRET`.

Do not create `NEXT_PUBLIC_CSE_IMPORT_SECRET`. Secrets must never be exposed to the browser bundle.

## Run with Docker

From the project root:

```bash
docker compose -f infra/docker-compose.yml up --build
```

Open:

```txt
http://localhost:3001
```

Backend remains available at:

```txt
http://localhost:5000
```

## Run only the Mega Panel with existing containers

If your backend/Postgres/Redis containers are already running:

```bash
docker compose -f infra/docker-compose.yml up --build mega-panel
```

## Logs

```bash
docker compose -f infra/docker-compose.yml logs -f mega-panel
```

## Stop

```bash
docker compose -f infra/docker-compose.yml down
```
