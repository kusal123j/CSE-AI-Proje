# Apply this package first

This ZIP contains modified/new files only. Copy it over your latest original project, preserving paths.

Recommended:

1. Back up your project.
2. Extract this ZIP over your project root.
3. Run database migration/startup schema.
4. Run backend/Python/Mega Panel checks listed in `TEST_RESULTS.md`.
5. Run live verification before production scheduler enablement:

```bash
python apps/python-worker/scripts/verify_cse_live_endpoints.py
```
