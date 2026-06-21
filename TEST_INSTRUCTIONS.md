# Test Instructions

From the project root:

```bash
npm ci --ignore-scripts
```

Backend:

```bash
DATABASE_URL=postgresql://test:test@localhost:5432/test npm --prefix apps/backend run typecheck
DATABASE_URL=postgresql://test:test@localhost:5432/test npm --prefix apps/backend test
DATABASE_URL=postgresql://test:test@localhost:5432/test npm --prefix apps/backend run build
```

Python worker:

```bash
python -m pip install -r apps/python-worker/requirements.txt
PYTHONPATH=apps/python-worker pytest -q apps/python-worker/tests
```

Mega Panel:

```bash
npm --prefix apps/mega-panel run typecheck
```

Verified in this package:

```text
Backend typecheck: passed
Backend tests: 29/29 passed
Backend build: passed
Python worker tests: 11/11 passed
Mega Panel typecheck: passed
```
