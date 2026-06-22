# Test Results - Full Project Package

Generated for the full-project ZIP after applying the final CSE Company Intelligence package to the original uploaded project.

## Python worker

Command:

```bash
cd apps/python-worker
python3 -m compileall -q app tests scripts
pytest -q
```

Result:

```text
36 passed in 4.07s
```

## Backend TypeScript

Command:

```bash
cd apps/backend
npm ci --silent
npm run typecheck
```

Result:

```text
PASS
```

## Backend tests

Command used with local test environment variables:

```bash
cd apps/backend
DATABASE_URL='postgresql://user:pass@localhost:5432/testdb' \
QDRANT_URL='http://localhost:6333' \
REDIS_URL='redis://localhost:6379' \
MINIO_ENDPOINT='localhost' \
MINIO_ACCESS_KEY='test' \
MINIO_SECRET_KEY='testtest' \
MINIO_BUCKET='cse-documents' \
JWT_SECRET='test-secret' \
PYTHON_WORKER_URL='http://localhost:8001' \
npm test -- --test-reporter=dot
```

Result:

```text
56 passed, 1 failed
```

The remaining failed backend test is the pre-existing unrelated Daily Market Summary string/regex test. It was intentionally not modified because this package must not touch unrelated project areas.

## Final review blocker fixed

The previous final package had a Python test failure because the live endpoint verifier script contained browser product names in its docstring. This full package removes those terms from the verifier script docstring while keeping the implementation browser-automation-free. The Python tests now pass.

## Mega Panel

Mega Panel source files are included. Independent typecheck could not be fully confirmed in this sandbox because the Next dependency install/type resolution did not complete cleanly here. No generated dependency folders are included in the ZIP.
