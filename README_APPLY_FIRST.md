# README_APPLY_FIRST — Full Corrected Project Package

This zip already contains the full project with the corrected CSE Daily Market Summary feature applied.

You do **not** need to apply a separate modified-files zip on top of this package.

## Steps

1. Backup your current project folder.
2. Extract this zip.
3. Open the extracted `CSE-AI-Proje-main` folder.
4. Run your normal Docker/dev commands.
5. Run the verification commands below.

## Verification commands

```bash
python3 -m pytest apps/python-worker/tests/test_cse_daily_market_summary_importer.py -q
python3 -m py_compile apps/python-worker/app/cse_daily_market_summary_importer.py apps/python-worker/app/main.py
npm --prefix apps/backend install
npm --prefix apps/backend run build
npm --prefix apps/mega-panel install
npm --prefix apps/mega-panel run build
```

## Important notes

- No Playwright or Chromium was added.
- Daily Market Summary uses HTTP/API first and HTML fallback/merge.
- Daily Market Summary is stored separately from company-level daily snapshots.
