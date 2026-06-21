import { Request, Response } from 'express';
import { ok } from '../../utils/apiResponse';
import { AppError } from '../../middleware/errorHandler';
import { cseService } from './cse.service';
import { cseAnalyticsService } from './cse.analytics.service';
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
