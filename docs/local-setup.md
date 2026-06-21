# Local Setup

## Start services

```bash
cp .env.example .env
docker compose -f infra/docker-compose.yml up --build
```

## Health checks

```bash
curl http://localhost:5000/health
curl http://localhost:5000/api/health/full
curl http://localhost:5000/api/health/ready
curl http://localhost:8000/health
```

`/api/health/ready` must return `ready` before document processing is considered safe.

## Tests

```bash
npm --prefix apps/backend run typecheck
npm --prefix apps/backend run build
npm --prefix apps/backend test
python -m py_compile apps/python-worker/app/*.py
python -m pytest apps/python-worker/tests
```

## Notes

Docker Compose could not be runtime-tested inside the ChatGPT sandbox because Docker is unavailable there. The source-level checks and tests above were run successfully.
