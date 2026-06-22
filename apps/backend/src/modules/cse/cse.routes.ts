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
cseRoutes.post('/import/daily-market-summary/run', cseImportAccessGuard, asyncHandler(cseController.runDailyMarketSummaryImport));
cseRoutes.post('/import/company-profiles/run', cseImportAccessGuard, asyncHandler(cseController.runCompanyProfilesImport));
cseRoutes.post('/import/company-profiles/:symbol/run', cseImportAccessGuard, asyncHandler(cseController.runCompanyProfileImportForSymbol));
cseRoutes.post('/import/company-financials/run', cseImportAccessGuard, asyncHandler(cseController.runCompanyFinancialsImport));
cseRoutes.post('/import/company-financials/:symbol/run', cseImportAccessGuard, asyncHandler(cseController.runCompanyFinancialsImportForSymbol));
cseRoutes.post('/import/company-announcements/run', cseImportAccessGuard, asyncHandler(cseController.runCompanyAnnouncementsImport));
cseRoutes.post('/import/company-announcements/:symbol/run', cseImportAccessGuard, asyncHandler(cseController.runCompanyAnnouncementsImportForSymbol));
cseRoutes.post('/import/latest-prices/run', cseImportAccessGuard, asyncHandler(cseController.runLatestPricesImport));
cseRoutes.post('/import/run', cseImportAccessGuard, asyncHandler(cseController.runImport));
cseRoutes.get('/import/runs', cseImportReadAccessGuard, asyncHandler(cseController.listFetchRuns));
cseRoutes.get('/import/runs/:id/raw-summary', cseImportReadAccessGuard, asyncHandler(cseController.rawRunSummary));
cseRoutes.get('/import/runs/:id/artifacts', cseImportReadAccessGuard, asyncHandler(cseController.rawRunSummary));
cseRoutes.get('/import/runs/:id', cseImportReadAccessGuard, asyncHandler(cseController.getFetchRun));
cseRoutes.get('/import/runs/:id/symbol-results', cseImportReadAccessGuard, asyncHandler(cseController.importRunSymbolResults));
cseRoutes.post('/import/runs/:id/retry-failed', cseImportAccessGuard, asyncHandler(cseController.retryFailedImportSymbols));

cseRoutes.get('/companies', asyncHandler(cseController.listCompanies));
cseRoutes.get('/securities', asyncHandler(cseController.listSecurities));
cseRoutes.get('/market/latest-date', asyncHandler(cseController.latestDate));

cseRoutes.get('/company-profiles', cseImportReadAccessGuard, asyncHandler(cseController.listCompanyProfiles));
cseRoutes.get('/company-profiles/:symbol', cseImportReadAccessGuard, asyncHandler(cseController.getCompanyProfile));
cseRoutes.get('/company-financial-reports', cseImportReadAccessGuard, asyncHandler(cseController.listAllCompanyFinancialReports));
cseRoutes.get('/company-profiles/:symbol/financial-reports', cseImportReadAccessGuard, asyncHandler(cseController.listCompanyFinancialReports));
cseRoutes.get('/company-announcements', cseImportReadAccessGuard, asyncHandler(cseController.listAllCompanyAnnouncements));
cseRoutes.get('/company-profiles/:symbol/announcements', cseImportReadAccessGuard, asyncHandler(cseController.listCompanyAnnouncements));
cseRoutes.get('/company-profiles/:symbol/latest-price', cseImportReadAccessGuard, asyncHandler(cseController.getCompanyLatestPrice));
cseRoutes.get('/latest-prices-market-status', cseImportReadAccessGuard, asyncHandler(cseController.latestMarketStatus));
cseRoutes.get('/latest-prices', cseImportReadAccessGuard, asyncHandler(cseController.listLatestPrices));
cseRoutes.get('/latest-prices/:symbol', cseImportReadAccessGuard, asyncHandler(cseController.getCompanyLatestPrice));
cseRoutes.post('/company-financial-reports/:id/retry-document', cseImportAccessGuard, asyncHandler(cseController.retryFinancialReportDocument));
cseRoutes.post('/company-announcements/:id/retry-document', cseImportAccessGuard, asyncHandler(cseController.retryAnnouncementDocument));
cseRoutes.get('/daily-market-summary/latest', cseImportReadAccessGuard, asyncHandler(cseController.latestDailyMarketSummary));
cseRoutes.get('/daily-market-summary/history', cseImportReadAccessGuard, asyncHandler(cseController.dailyMarketSummaryHistory));
cseRoutes.get('/daily-market-summary', cseImportReadAccessGuard, asyncHandler(cseController.getDailyMarketSummary));
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
