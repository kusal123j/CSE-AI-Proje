# Run Instructions

## Docker development

```bash
cp .env.example .env
# edit secrets if needed
docker compose -f infra/docker-compose.yml up --build
```

## Run database migration

If migrations are not enabled on startup:

```bash
npm --prefix apps/backend run db:migrate
```

## Production artifact storage

Raw CSE import artifacts are saved under `CSE_IMPORT_ARTIFACT_STORAGE_DIR`.
Mount this path as a persistent Docker/Coolify volume in production.

Example env:

```env
CSE_IMPORT_ARTIFACT_STORAGE_DIR=/app/storage/cse-imports
```

## Manual CSE import

The manual endpoint is now non-blocking. It returns a `runId` immediately while the import continues in the backend process.

```bash
curl -X POST http://localhost:5000/api/cse/import/alphabetical/run \
  -H "Content-Type: application/json" \
  -H "x-cse-import-secret: $CSE_IMPORT_INTERNAL_SECRET" \
  -d '{}'
```

Alias route:

```bash
curl -X POST http://localhost:5000/api/cse/import/run \
  -H "Content-Type: application/json" \
  -H "x-cse-import-secret: $CSE_IMPORT_INTERNAL_SECRET" \
  -d '{}'
```

## Poll import status

```bash
curl http://localhost:5000/api/cse/import/runs/<RUN_ID>
```

## Check importer config

```bash
curl http://localhost:5000/api/cse/import/config
```

## Check import runs

```bash
curl http://localhost:5000/api/cse/import/runs
```
