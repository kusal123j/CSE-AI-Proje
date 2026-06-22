# Modified Only Manifest

Generated: 2026-06-22T06:51:33.242985Z

Changed files: 15
Added files: 35
Deleted files: 0

## Changed files
- .env.example
- apps/backend/src/config/env.ts
- apps/backend/src/database/schema.sql
- apps/backend/src/modules/cse/cse.controller.ts
- apps/backend/src/modules/cse/cse.routes.ts
- apps/backend/src/modules/cse/cse.scheduler.ts
- apps/backend/src/modules/cse/cse.service.ts
- apps/backend/src/modules/cse/cse.sourceGuard.test.ts
- apps/backend/src/modules/cse/cse.sourceGuard.ts
- apps/backend/src/server.ts
- apps/mega-panel/components/layout/Sidebar.tsx
- apps/mega-panel/lib/api/cse.ts
- apps/mega-panel/lib/types/cse.ts
- apps/python-worker/app/config.py
- apps/python-worker/app/main.py

## Added files
- apps/backend/src/modules/cse/cse.companyIntelligence.correction.test.ts
- apps/backend/src/modules/cse/cse.companyIntelligence.fetcher.ts
- apps/backend/src/modules/cse/cse.companyIntelligence.finalOps.test.ts
- apps/backend/src/modules/cse/cse.companyIntelligence.repository.ts
- apps/backend/src/modules/cse/cse.companyIntelligence.service.ts
- apps/backend/src/modules/cse/cse.companyIntelligence.types.ts
- apps/mega-panel/app/api/cse/company-announcements/[id]/retry-document/route.ts
- apps/mega-panel/app/api/cse/company-financial-reports/[id]/retry-document/route.ts
- apps/mega-panel/app/api/cse/import/company-announcements/run/route.ts
- apps/mega-panel/app/api/cse/import/company-financials/run/route.ts
- apps/mega-panel/app/api/cse/import/company-profiles/run/route.ts
- apps/mega-panel/app/api/cse/import/latest-prices/run/route.ts
- apps/mega-panel/app/api/cse/import/runs/[id]/retry-failed/route.ts
- apps/mega-panel/app/company-announcements/page.tsx
- apps/mega-panel/app/company-financial-reports/page.tsx
- apps/mega-panel/app/company-import-runs/[runId]/page.tsx
- apps/mega-panel/app/company-intelligence-pages.test.ts
- apps/mega-panel/app/company-profiles/[symbol]/page.tsx
- apps/mega-panel/app/company-profiles/page.tsx
- apps/mega-panel/app/latest-prices/page.tsx
- apps/python-worker/app/cse_announcements_importer.py
- apps/python-worker/app/cse_company_profile_importer.py
- apps/python-worker/app/cse_financial_reports_importer.py
- apps/python-worker/app/cse_latest_price_importer.py
- apps/python-worker/scripts/verify_cse_live_endpoints.py
- apps/python-worker/tests/fixtures/cse/announcements_afsl.json
- apps/python-worker/tests/fixtures/cse/financial_reports_afsl.json
- apps/python-worker/tests/fixtures/cse/latest_prices_today.json
- apps/python-worker/tests/fixtures/cse/live_verified/README.md
- apps/python-worker/tests/test_cse_company_intelligence_importers.py
- apps/python-worker/tests/test_cse_live_verification_script.py
- docs/CSE_COMPANY_INTELLIGENCE_RUNBOOK.md
- docs/CSE_DOCUMENT_RETRY_WORKFLOW.md
- docs/CSE_IMPORT_RETRY_WORKFLOW.md
- docs/CSE_LIVE_API_VERIFICATION.md

## Deleted files
