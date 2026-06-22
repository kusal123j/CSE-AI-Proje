import { Request, Response } from 'express';
import { ok } from '../../utils/apiResponse';
import { AppError } from '../../middleware/errorHandler';
import { cseService } from './cse.service';
import { cseAnalyticsService } from './cse.analytics.service';
import { cseCompanyIntelligenceService } from './cse.companyIntelligence.service';
import { findFetchRun, gicsDashboard, listFetchRuns, listGicsClassifications, listGicsGroups, listGicsIndices, listGicsSummary, listGicsUnmapped } from './cse.repository';

function page(req: Request) {
  return req.query.page ? Number(req.query.page) : undefined;
}

function limit(req: Request) {
  return req.query.limit ? Number(req.query.limit) : undefined;
}

export const cseController = {
  async runImport(req: Request, res: Response) {
    const tradingDate = typeof req.body?.tradingDate === 'string' ? req.body.tradingDate : undefined;
    return ok(res, await cseService.startAlphabeticalImportJob({ tradingDate, triggerType: 'manual' }), 202);
  },

  async runTradeSummaryImport(req: Request, res: Response) {
    const tradingDate = typeof req.body?.tradingDate === 'string' ? req.body.tradingDate : undefined;
    return ok(res, await cseService.startTradeSummaryImportJob({ tradingDate, triggerType: 'manual' }), 202);
  },


  async runDailyMarketSummaryImport(req: Request, res: Response) {
    const tradingDate = typeof req.body?.tradingDate === 'string' ? req.body.tradingDate : undefined;
    return ok(res, await cseService.startDailyMarketSummaryImportJob({ tradingDate, triggerType: 'manual' }), 202);
  },

  async runGicsImport(req: Request, res: Response) {
    const tradingDate = typeof req.body?.tradingDate === 'string' ? req.body.tradingDate : undefined;
    return ok(res, await cseService.startGicsImportJob({ tradingDate, triggerType: 'manual' }), 202);
  },

  async summary(_req: Request, res: Response) {
    return ok(res, await cseAnalyticsService.getDashboardSummary());
  },

  async importConfig(_req: Request, res: Response) {
    return ok(res, await cseService.importConfig());
  },

  async listFetchRuns(req: Request, res: Response) {
    return ok(res, await listFetchRuns(limit(req)));
  },

  async getFetchRun(req: Request, res: Response) {
    const run = await findFetchRun(req.params.id);
    if (!run) throw new AppError(404, 'CSE fetch run not found');
    return ok(res, run);
  },

  async rawRunSummary(req: Request, res: Response) {
    return ok(res, await cseService.rawRunSummary(req.params.id));
  },

  async latestDate(_req: Request, res: Response) {
    return ok(res, { tradingDate: await cseAnalyticsService.latestTradingDate() });
  },


  async latestDailyMarketSummary(_req: Request, res: Response) {
    return ok(res, await cseAnalyticsService.latestDailyMarketSummary());
  },

  async getDailyMarketSummary(req: Request, res: Response) {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    return ok(res, await cseAnalyticsService.getDailyMarketSummaryByDate(date));
  },

  async dailyMarketSummaryHistory(req: Request, res: Response) {
    return ok(
      res,
      await cseAnalyticsService.dailyMarketSummaryHistory({
        from: typeof req.query.from === 'string' ? req.query.from : undefined,
        to: typeof req.query.to === 'string' ? req.query.to : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined
      })
    );
  },

  async listCompanies(req: Request, res: Response) {
    return ok(res, await cseAnalyticsService.listCompanies({ page: page(req), limit: limit(req), search: String(req.query.search ?? '') }));
  },

  async listSecurities(req: Request, res: Response) {
    return ok(res, await cseAnalyticsService.listSecurities({ page: page(req), limit: limit(req), search: String(req.query.search ?? '') }));
  },

  async listDaily(req: Request, res: Response) {
    return ok(
      res,
      await cseAnalyticsService.listDaily({
        date: typeof req.query.date === 'string' ? req.query.date : undefined,
        page: page(req),
        limit: limit(req),
        search: String(req.query.search ?? '')
      })
    );
  },

  async getBySymbol(req: Request, res: Response) {
    const row = await cseAnalyticsService.getBySymbol(req.params.symbol, typeof req.query.date === 'string' ? req.query.date : undefined);
    if (!row) throw new AppError(404, 'CSE daily market snapshot not found');
    return ok(res, row);
  },

  async gainers(req: Request, res: Response) {
    return ok(res, await cseAnalyticsService.rank({ type: 'gainers', date: String(req.query.date || ''), page: page(req), limit: limit(req) }));
  },

  async losers(req: Request, res: Response) {
    return ok(res, await cseAnalyticsService.rank({ type: 'losers', date: String(req.query.date || ''), page: page(req), limit: limit(req) }));
  },

  async topTurnover(req: Request, res: Response) {
    return ok(res, await cseAnalyticsService.rank({ type: 'topTurnover', date: String(req.query.date || ''), page: page(req), limit: limit(req) }));
  },

  async topTradeVolume(req: Request, res: Response) {
    return ok(res, await cseAnalyticsService.rank({ type: 'topTradeVolume', date: String(req.query.date || ''), page: page(req), limit: limit(req) }));
  },

  async topShareVolume(req: Request, res: Response) {
    return ok(res, await cseAnalyticsService.rank({ type: 'topShareVolume', date: String(req.query.date || ''), page: page(req), limit: limit(req) }));
  },

  async watchListMovers(req: Request, res: Response) {
    return ok(res, await cseAnalyticsService.rank({ type: 'watchListMovers', date: String(req.query.date || ''), page: page(req), limit: limit(req) }));
  },

  async marketBreadth(req: Request, res: Response) {
    return ok(res, await cseAnalyticsService.marketBreadth({ date: String(req.query.date || '') }));
  },


  async runCompanyProfilesImport(req: Request, res: Response) {
    return ok(
      res,
      await cseCompanyIntelligenceService.startCompanyProfilesImport({
        symbol: typeof req.body?.symbol === 'string' ? req.body.symbol : undefined,
        limit: req.body?.limit ? Number(req.body.limit) : undefined,
        triggerType: 'manual'
      }),
      202
    );
  },

  async runCompanyProfileImportForSymbol(req: Request, res: Response) {
    return ok(res, await cseCompanyIntelligenceService.startCompanyProfilesImport({ symbol: req.params.symbol, triggerType: 'manual' }), 202);
  },

  async runCompanyFinancialsImport(req: Request, res: Response) {
    return ok(
      res,
      await cseCompanyIntelligenceService.startFinancialReportsImport({
        symbol: typeof req.body?.symbol === 'string' ? req.body.symbol : undefined,
        limit: req.body?.limit ? Number(req.body.limit) : undefined,
        triggerType: 'manual'
      }),
      202
    );
  },

  async runCompanyFinancialsImportForSymbol(req: Request, res: Response) {
    return ok(res, await cseCompanyIntelligenceService.startFinancialReportsImport({ symbol: req.params.symbol, triggerType: 'manual' }), 202);
  },

  async runCompanyAnnouncementsImport(req: Request, res: Response) {
    return ok(
      res,
      await cseCompanyIntelligenceService.startAnnouncementsImport({
        symbol: typeof req.body?.symbol === 'string' ? req.body.symbol : undefined,
        startDate: typeof req.body?.startDate === 'string' ? req.body.startDate : undefined,
        endDate: typeof req.body?.endDate === 'string' ? req.body.endDate : undefined,
        limit: req.body?.limit ? Number(req.body.limit) : undefined,
        triggerType: 'manual'
      }),
      202
    );
  },

  async runCompanyAnnouncementsImportForSymbol(req: Request, res: Response) {
    return ok(
      res,
      await cseCompanyIntelligenceService.startAnnouncementsImport({
        symbol: req.params.symbol,
        startDate: typeof req.body?.startDate === 'string' ? req.body.startDate : undefined,
        endDate: typeof req.body?.endDate === 'string' ? req.body.endDate : undefined,
        triggerType: 'manual'
      }),
      202
    );
  },

  async runLatestPricesImport(req: Request, res: Response) {
    return ok(res, await cseCompanyIntelligenceService.startLatestPricesImport({ insertSnapshot: req.body?.insertSnapshot !== false, triggerType: 'manual' }), 202);
  },

  async listCompanyProfiles(req: Request, res: Response) {
    return ok(res, await cseCompanyIntelligenceService.listCompanyProfiles({ limit: limit(req), search: String(req.query.search ?? '') }));
  },

  async getCompanyProfile(req: Request, res: Response) {
    return ok(res, await cseCompanyIntelligenceService.getCompanyIntelligence(req.params.symbol));
  },

  async listCompanyFinancialReports(req: Request, res: Response) {
    return ok(res, await cseCompanyIntelligenceService.listFinancialReports(req.params.symbol));
  },

  async listCompanyAnnouncements(req: Request, res: Response) {
    return ok(
      res,
      await cseCompanyIntelligenceService.listAnnouncements(req.params.symbol, {
        startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
        endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined
      })
    );
  },


  async listAllCompanyFinancialReports(req: Request, res: Response) {
    return ok(
      res,
      await cseCompanyIntelligenceService.listAllFinancialReports({
        symbol: typeof req.query.symbol === 'string' ? req.query.symbol : undefined,
        reportType: typeof req.query.reportType === 'string' ? req.query.reportType : undefined,
        financialYear: typeof req.query.financialYear === 'string' ? req.query.financialYear : undefined,
        documentStatus: typeof req.query.documentStatus === 'string' ? req.query.documentStatus : undefined,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        limit: limit(req)
      })
    );
  },

  async listAllCompanyAnnouncements(req: Request, res: Response) {
    return ok(
      res,
      await cseCompanyIntelligenceService.listAllAnnouncements({
        symbol: typeof req.query.symbol === 'string' ? req.query.symbol : undefined,
        startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
        endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
        category: typeof req.query.category === 'string' ? req.query.category : undefined,
        documentStatus: typeof req.query.documentStatus === 'string' ? req.query.documentStatus : undefined,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        limit: limit(req)
      })
    );
  },

  async getCompanyLatestPrice(req: Request, res: Response) {
    return ok(res, await cseCompanyIntelligenceService.getLatestPrice(req.params.symbol));
  },

  async listLatestPrices(req: Request, res: Response) {
    return ok(res, await cseCompanyIntelligenceService.listLatestPrices({ limit: limit(req), search: String(req.query.search ?? '') }));
  },

  async latestMarketStatus(_req: Request, res: Response) {
    return ok(res, await cseCompanyIntelligenceService.latestMarketStatus());
  },

  async importRunSymbolResults(req: Request, res: Response) {
    return ok(
      res,
      await cseCompanyIntelligenceService.listImportRunSymbolResults(req.params.id, {
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        importType: typeof req.query.importType === 'string' ? (req.query.importType as never) : undefined,
        symbol: typeof req.query.symbol === 'string' ? req.query.symbol : undefined,
        limit: limit(req),
        offset: req.query.offset ? Number(req.query.offset) : undefined
      })
    );
  },

  async retryFailedImportSymbols(req: Request, res: Response) {
    return ok(
      res,
      await cseCompanyIntelligenceService.retryFailedSymbols(req.params.id, {
        importType: req.body?.importType,
        startDate: typeof req.body?.startDate === 'string' ? req.body.startDate : undefined,
        endDate: typeof req.body?.endDate === 'string' ? req.body.endDate : undefined,
        limit: req.body?.limit ? Number(req.body.limit) : undefined
      }),
      202
    );
  },

  async retryFinancialReportDocument(req: Request, res: Response) {
    return ok(res, await cseCompanyIntelligenceService.retryFinancialReportDocument(req.params.id), 202);
  },

  async retryAnnouncementDocument(req: Request, res: Response) {
    return ok(res, await cseCompanyIntelligenceService.retryAnnouncementDocument(req.params.id), 202);
  },

  async gicsDashboard(_req: Request, res: Response) {
    return ok(res, await gicsDashboard());
  },

  async listGicsGroups(_req: Request, res: Response) {
    return ok(res, await listGicsGroups());
  },

  async listGicsSummary(req: Request, res: Response) {
    return ok(res, await listGicsSummary(limit(req)));
  },

  async listGicsIndices(req: Request, res: Response) {
    return ok(res, await listGicsIndices(limit(req)));
  },

  async listGicsClassifications(req: Request, res: Response) {
    return ok(res, await listGicsClassifications(limit(req), String(req.query.search ?? '')));
  },

  async listGicsUnmapped(_req: Request, res: Response) {
    return ok(res, await listGicsUnmapped());
  }
};
