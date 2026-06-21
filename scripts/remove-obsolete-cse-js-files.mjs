#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const obsoletePaths = [
  'apps/backend/src/modules/cse/controllers/cse.controller.js',
  'apps/backend/src/modules/cse/index.js',
  'apps/backend/src/modules/cse/middlewares/cseAccess.middleware.js',
  'apps/backend/src/modules/cse/models/cseCompany.model.js',
  'apps/backend/src/modules/cse/models/cseDailyMarketSnapshot.model.js',
  'apps/backend/src/modules/cse/models/cseFetchRun.model.js',
  'apps/backend/src/modules/cse/models/cseSecurity.model.js',
  'apps/backend/src/modules/cse/routes/cse.routes.js',
  'apps/backend/src/modules/cse/scheduler/cse.scheduler.js',
  'apps/backend/src/modules/cse/services/cseAlphabeticalBrowserCollector.service.js',
  'apps/backend/src/modules/cse/services/cseAlphabeticalFetcher.service.js',
  'apps/backend/src/modules/cse/services/cseAlphabeticalParser.service.js',
  'apps/backend/src/modules/cse/services/cseAnalytics.service.js',
  'apps/backend/src/modules/cse/services/cseAnalyticsQuery.service.js',
  'apps/backend/src/modules/cse/services/cseImport.service.js',
  'apps/backend/src/modules/cse/services/cseNormalizer.service.js',
  'apps/backend/src/modules/cse/services/cseSnapshotUpsertBuilder.service.js',
  'apps/backend/src/modules/cse/services/cseSourceGuard.service.js',
  'apps/backend/tests/cse/cseAccessMiddleware.test.js',
  'apps/backend/tests/cse/cseAlphabeticalParser.test.js',
  'apps/backend/tests/cse/cseAnalyticsHelpers.test.js',
  'apps/backend/tests/cse/cseCsvParser.test.js',
  'apps/backend/tests/cse/cseImporterIdempotency.test.js',
  'apps/backend/tests/cse/cseNormalizer.test.js',
  'apps/backend/tests/cse/cseSourceGuard.test.js'
];

const directoriesToRemoveIfEmpty = [
  'apps/backend/src/modules/cse/controllers',
  'apps/backend/src/modules/cse/middlewares',
  'apps/backend/src/modules/cse/models',
  'apps/backend/src/modules/cse/routes',
  'apps/backend/src/modules/cse/scheduler',
  'apps/backend/src/modules/cse/services',
  'apps/backend/tests/cse'
];

let removed = 0;
let missing = 0;

for (const relativePath of obsoletePaths) {
  const absolutePath = path.join(projectRoot, relativePath);
  if (fs.existsSync(absolutePath)) {
    fs.rmSync(absolutePath, { force: true });
    console.log(`removed ${relativePath}`);
    removed += 1;
  } else {
    missing += 1;
  }
}

for (const relativePath of directoriesToRemoveIfEmpty) {
  const absolutePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(absolutePath)) continue;
  try {
    fs.rmdirSync(absolutePath);
    console.log(`removed empty directory ${relativePath}`);
  } catch {
    // Directory is not empty; keep it.
  }
}

console.log(`CSE obsolete cleanup complete. removed=${removed}, alreadyMissing=${missing}`);
