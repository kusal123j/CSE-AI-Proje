# MODIFIED ONLY MANIFEST

This correction package keeps the A-Z importer intact and adds/hardens the separate CSE Trade Summary daily market importer.

## Key corrections in this pass

- Added CSV download auto-discovery from the Trade Summary page before HTML fallback.
- Strengthened Watch List detection from API fields, status text, and highlighted HTML row classes.
- Added `watchListDetectionSource` tracing in normalized output/raw row.
- Added backend completion helper tests for success/partial/warning behavior.
- Updated Mega Panel wording to show imports are started asynchronously and status refreshes shortly.
- Documented `server.ts` scheduler lifecycle as an approved change.

## File list

| Type | File | Reason | Risk |
|---|---|---|---|
| Added | `FILE_CONTENT_HASH_DIFF.patch` | Required CSE Trade Summary data/schema/API/UI/test/report update. | Low |
| Added | `FULL_CONTENT_DIFF.patch` | Required CSE Trade Summary data/schema/API/UI/test/report update. | Low |
| Added | `apps/backend/src/modules/cse/cse.tradeSummary.test.ts` | Backend route/config/completion tests. | Low |
| Added | `apps/mega-panel/app/api/cse/import/trade-summary/run/route.ts` | Required CSE Trade Summary data/schema/API/UI/test/report update. | Low |
| Added | `apps/python-worker/app/cse_trade_summary_importer.py` | Trade Summary HTTP/API + CSV discovery + HTML fallback + Watch List detection. | Low |
| Added | `apps/python-worker/tests/test_cse_trade_summary_importer.py` | Importer parsing, fallback discovery, and Watch List tests. | Low |
| Modified | `.env.example` | Required CSE Trade Summary data/schema/API/UI/test/report update. | Low |
| Modified | `apps/backend/src/config/env.test.ts` | Required CSE Trade Summary data/schema/API/UI/test/report update. | Low |
| Modified | `apps/backend/src/config/env.ts` | Required CSE Trade Summary data/schema/API/UI/test/report update. | Low |
| Modified | `apps/backend/src/database/schema.sql` | Required CSE Trade Summary data/schema/API/UI/test/report update. | Low |
| Modified | `apps/backend/src/modules/cse/cse.analytics.service.ts` | Required CSE Trade Summary data/schema/API/UI/test/report update. | Low |
| Modified | `apps/backend/src/modules/cse/cse.controller.ts` | Required CSE Trade Summary data/schema/API/UI/test/report update. | Low |
| Modified | `apps/backend/src/modules/cse/cse.fetcher.ts` | Required CSE Trade Summary data/schema/API/UI/test/report update. | Low |
| Modified | `apps/backend/src/modules/cse/cse.projectIntegration.test.ts` | Required CSE Trade Summary data/schema/API/UI/test/report update. | Low |
| Modified | `apps/backend/src/modules/cse/cse.repository.ts` | Required CSE Trade Summary data/schema/API/UI/test/report update. | Low |
| Modified | `apps/backend/src/modules/cse/cse.routes.ts` | Required CSE Trade Summary data/schema/API/UI/test/report update. | Low |
| Modified | `apps/backend/src/modules/cse/cse.scheduler.ts` | Required CSE Trade Summary data/schema/API/UI/test/report update. | Low |
| Modified | `apps/backend/src/modules/cse/cse.service.ts` | Trade Summary async job completion logic, config reporting, scheduler support. | Low |
| Modified | `apps/backend/src/modules/cse/cse.types.ts` | Required CSE Trade Summary data/schema/API/UI/test/report update. | Low |
| Modified | `apps/backend/src/server.ts` | Starts/stops Trade Summary scheduler when enabled. | Low |
| Modified | `apps/mega-panel/app/cse-import/page.tsx` | Required CSE Trade Summary data/schema/API/UI/test/report update. | Low |
| Modified | `apps/mega-panel/app/market-analytics/page.tsx` | Required CSE Trade Summary data/schema/API/UI/test/report update. | Low |
| Modified | `apps/mega-panel/components/cse/AzProgressGrid.tsx` | Required CSE Trade Summary data/schema/API/UI/test/report update. | Low |
| Modified | `apps/mega-panel/components/cse/ImportControlPanel.tsx` | Manual import UX/status wording and short refresh after trigger. | Low |
| Modified | `apps/mega-panel/components/tables/AnalyticsRankingTable.tsx` | Required CSE Trade Summary data/schema/API/UI/test/report update. | Low |
| Modified | `apps/mega-panel/components/tables/DailySnapshotsTable.tsx` | Required CSE Trade Summary data/schema/API/UI/test/report update. | Low |
| Modified | `apps/mega-panel/hooks/useAnalytics.ts` | Required CSE Trade Summary data/schema/API/UI/test/report update. | Low |
| Modified | `apps/mega-panel/lib/api/cse.ts` | Required CSE Trade Summary data/schema/API/UI/test/report update. | Low |
| Modified | `apps/mega-panel/lib/types/cse.ts` | Required CSE Trade Summary data/schema/API/UI/test/report update. | Low |
| Modified | `apps/python-worker/app/config.py` | Required CSE Trade Summary data/schema/API/UI/test/report update. | Low |
| Modified | `apps/python-worker/app/main.py` | Required CSE Trade Summary data/schema/API/UI/test/report update. | Low |
