import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { cseController } from './cse.controller';
import { cseImportAccessGuard, cseImportReadAccessGuard } from './cse.access';

export const cseRoutes = Router();

cseRoutes.get('/summary', cseImportReadAccessGuard, asyncHandler(cseController.summary));
cseRoutes.get('/import/config', cseImportReadAccessGuard, asyncHandler(cseController.importConfig));
cseRoutes.post('/import/alphabetical/run', cseImportAccessGuard, asyncHandler(cseController.runImport));
cseRoutes.post('/import/trade-summary/run', cseImportAccessGuard, asyncHandler(cseController.runTradeSummaryImport));
cseRoutes.post('/import/gics/run', cseImportAccessGuard, asyncHandler(cseController.runGicsImport));
cseRoutes.post('/import/run', cseImportAccessGuard, asyncHandler(cseController.runImport));
cseRoutes.get('/import/runs', cseImportReadAccessGuard, asyncHandler(cseController.listFetchRuns));
cseRoutes.get('/import/runs/:id/raw-summary', cseImportReadAccessGuard, asyncHandler(cseController.rawRunSummary));
cseRoutes.get('/import/runs/:id/artifacts', cseImportReadAccessGuard, asyncHandler(cseController.rawRunSummary));
cseRoutes.get('/import/runs/:id', cseImportReadAccessGuard, asyncHandler(cseController.getFetchRun));

cseRoutes.get('/companies', asyncHandler(cseController.listCompanies));
cseRoutes.get('/securities', asyncHandler(cseController.listSecurities));
cseRoutes.get('/market/latest-date', asyncHandler(cseController.latestDate));
cseRoutes.get('/market/daily', asyncHandler(cseController.listDaily));
cseRoutes.get('/market/daily/:symbol', asyncHandler(cseController.getBySymbol));
cseRoutes.get('/market/gainers', asyncHandler(cseController.gainers));
cseRoutes.get('/market/losers', asyncHandler(cseController.losers));
cseRoutes.get('/market/top-turnover', asyncHandler(cseController.topTurnover));
cseRoutes.get('/market/top-trade-volume', asyncHandler(cseController.topTradeVolume));
cseRoutes.get('/market/top-share-volume', asyncHandler(cseController.topShareVolume));
cseRoutes.get('/market/watch-list-movers', asyncHandler(cseController.watchListMovers));
cseRoutes.get('/market/breadth', asyncHandler(cseController.marketBreadth));

// CSE GICS industry intelligence endpoints
cseRoutes.get('/gics/dashboard', cseImportReadAccessGuard, asyncHandler(cseController.gicsDashboard));
cseRoutes.get('/gics/groups', cseImportReadAccessGuard, asyncHandler(cseController.listGicsGroups));
cseRoutes.get('/gics/summary', cseImportReadAccessGuard, asyncHandler(cseController.listGicsSummary));
cseRoutes.get('/gics/indices', cseImportReadAccessGuard, asyncHandler(cseController.listGicsIndices));
cseRoutes.get('/gics/classifications', cseImportReadAccessGuard, asyncHandler(cseController.listGicsClassifications));
cseRoutes.get('/gics/unmapped', cseImportReadAccessGuard, asyncHandler(cseController.listGicsUnmapped));
