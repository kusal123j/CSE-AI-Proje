# Docker Backend Startup Hotfix

Apply this hotfix after applying the Docker-ready Mega Panel ZIP.

## What it fixes

PostgreSQL failed during backend startup with:

`ERROR: functions in index predicate must be marked IMMUTABLE`

The cause is the partial unique index in `apps/backend/src/database/schema.sql` using enum-to-text casts in the index predicate:

```sql
status::text <> 'DUPLICATE'
document_type::text IN ('ANNUAL_REPORT', 'INTERIM_REPORT')
```

PostgreSQL rejects that predicate. This hotfix compares enum values directly instead:

```sql
status <> 'DUPLICATE'::document_status
document_type IN ('ANNUAL_REPORT'::document_type, 'INTERIM_REPORT'::document_type)
```

## Files changed

- `apps/backend/src/database/schema.sql`

## Run after applying

```bash
docker compose -f infra/docker-compose.yml down
docker compose -f infra/docker-compose.yml up --build backend
```

If backend becomes healthy, run the full stack:

```bash
docker compose -f infra/docker-compose.yml up --build
```

## If Redis DNS error still appears

Check your root `.env` has:

```env
REDIS_HOST=redis
REDIS_PORT=6379
```

Then test Docker DNS:

```bash
docker compose -f infra/docker-compose.yml run --rm backend getent hosts redis
```
