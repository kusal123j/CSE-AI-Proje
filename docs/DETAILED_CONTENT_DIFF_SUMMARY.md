# Detailed Content Diff Summary

Compared the final package paths against the uploaded `CSE full project.zip` by SHA-256 content hash.

## New files (26)

- `README_APPLY_FIRST.md`
- `apps/backend/src/modules/cse/cse.access.ts`
- `apps/backend/src/modules/cse/cse.analytics.service.ts`
- `apps/backend/src/modules/cse/cse.controller.ts`
- `apps/backend/src/modules/cse/cse.fetcher.ts`
- `apps/backend/src/modules/cse/cse.normalizer.test.ts`
- `apps/backend/src/modules/cse/cse.normalizer.ts`
- `apps/backend/src/modules/cse/cse.parser.test.ts`
- `apps/backend/src/modules/cse/cse.parser.ts`
- `apps/backend/src/modules/cse/cse.projectIntegration.test.ts`
- `apps/backend/src/modules/cse/cse.repository.ts`
- `apps/backend/src/modules/cse/cse.routes.ts`
- `apps/backend/src/modules/cse/cse.scheduler.ts`
- `apps/backend/src/modules/cse/cse.service.ts`
- `apps/backend/src/modules/cse/cse.sourceGuard.test.ts`
- `apps/backend/src/modules/cse/cse.sourceGuard.ts`
- `apps/backend/src/modules/cse/cse.types.ts`
- `docs/CSE_DATA_SOURCE_RULES.md`
- `docs/FILE_CONTENT_COMPARISON_REPORT.md`
- `docs/IMPLEMENTATION_SUMMARY.md`
- `docs/REMOVE_OBSOLETE_CSE_JS_FILES.md`
- `docs/SECURITY_REVIEW.md`
- `docs/TESTING_NOTES.md`
- `docs/TEST_RESULTS.md`
- `docs/OBSOLETE_CSE_FILE_DELETE_MANIFEST.txt`
- `scripts/remove-obsolete-cse-js-files.mjs`

## Modified files (6)

- `.env.example`
- `apps/backend/.env.cse.example`
- `apps/backend/src/app.ts`
- `apps/backend/src/server.ts`
- `apps/backend/src/config/env.ts`
- `apps/backend/src/database/schema.sql`

## Included unchanged files (0)

None

## Obsolete old JS/Mongoose files present in uploaded project and intentionally deleted by cleanup (25)

- `apps/backend/src/modules/cse/controllers/cse.controller.js`
- `apps/backend/src/modules/cse/index.js`
- `apps/backend/src/modules/cse/middlewares/cseAccess.middleware.js`
- `apps/backend/src/modules/cse/models/cseCompany.model.js`
- `apps/backend/src/modules/cse/models/cseDailyMarketSnapshot.model.js`
- `apps/backend/src/modules/cse/models/cseFetchRun.model.js`
- `apps/backend/src/modules/cse/models/cseSecurity.model.js`
- `apps/backend/src/modules/cse/routes/cse.routes.js`
- `apps/backend/src/modules/cse/scheduler/cse.scheduler.js`
- `apps/backend/src/modules/cse/services/cseAlphabeticalBrowserCollector.service.js`
- `apps/backend/src/modules/cse/services/cseAlphabeticalFetcher.service.js`
- `apps/backend/src/modules/cse/services/cseAlphabeticalParser.service.js`
- `apps/backend/src/modules/cse/services/cseAnalytics.service.js`
- `apps/backend/src/modules/cse/services/cseAnalyticsQuery.service.js`
- `apps/backend/src/modules/cse/services/cseImport.service.js`
- `apps/backend/src/modules/cse/services/cseNormalizer.service.js`
- `apps/backend/src/modules/cse/services/cseSnapshotUpsertBuilder.service.js`
- `apps/backend/src/modules/cse/services/cseSourceGuard.service.js`
- `apps/backend/tests/cse/cseAccessMiddleware.test.js`
- `apps/backend/tests/cse/cseAlphabeticalParser.test.js`
- `apps/backend/tests/cse/cseAnalyticsHelpers.test.js`
- `apps/backend/tests/cse/cseCsvParser.test.js`
- `apps/backend/tests/cse/cseImporterIdempotency.test.js`
- `apps/backend/tests/cse/cseNormalizer.test.js`
- `apps/backend/tests/cse/cseSourceGuard.test.js`

## Unrelated code policy

No payment, AI, Qdrant, document pipeline, MinIO, user/auth, Docker, or frontend files are included in this package.