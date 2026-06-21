import { env } from '../../config/env';
import { query } from '../../config/database';

export interface MarketQueryOptions {
  date?: string;
  page?: number;
  limit?: number;
  search?: string;
}

function normalizePagination(page = 1, limit = 25) {
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  return { limit: safeLimit, offset: (safePage - 1) * safeLimit, page: safePage };
}

async function resolveDate(date?: string): Promise<string | null> {
  if (date?.trim()) return date;
  const tradeSummary = await query(`SELECT MAX(trading_date)::text AS trading_date FROM cse_daily_market_snapshots WHERE source_page = 'TRADE_SUMMARY'`);
  if (tradeSummary.rows[0]?.trading_date) return tradeSummary.rows[0].trading_date;
  const result = await query(`SELECT MAX(trading_date)::text AS trading_date FROM cse_daily_market_snapshots`);
  return result.rows[0]?.trading_date ?? null;
}


async function freshnessMeta() {
  const result = await query(`SELECT id, finished_at FROM cse_fetch_runs WHERE status IN ('SUCCESS', 'PARTIAL_SUCCESS') ORDER BY finished_at DESC NULLS LAST, started_at DESC LIMIT 1`);
  const row = result.rows[0] ?? null;
  const finishedAt = row?.finished_at ? new Date(row.finished_at) : null;
  const isStale = !finishedAt || Date.now() - finishedAt.getTime() > env.CSE_IMPORT_STALE_AFTER_HOURS * 60 * 60 * 1000;
  return {
    lastImportedAt: finishedAt?.toISOString() ?? null,
    lastSuccessfulImportId: row?.id ?? null,
    source: 'CSE Listed Company Directory - ALPHABETICAL + Trade Summary' as const,
    sourceUrl: env.CSE_IMPORT_SOURCE_URL,
    mode: env.CSE_IMPORT_FETCH_MODE,
    isStale,
    staleAfterHours: env.CSE_IMPORT_STALE_AFTER_HOURS
  };
}

async function withFreshness<T>(data: T) {
  return { data, meta: await freshnessMeta() };
}

function baseSnapshotSelect() {
  return `
    SELECT
      s.*,
      COALESCE(s.raw_row ->> 'sourceLetter', s.raw_row ->> 'source_letter') AS source_letter,
      sec.id AS security_id,
      c.id AS company_id,
      c.name AS company_name,
      c.logo_url,
      c.profile_url
    FROM cse_daily_market_snapshots s
    JOIN cse_securities sec ON sec.id = s.security_id
    JOIN cse_companies c ON c.id = sec.company_id
  `;
}
function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function percentChange(today: unknown, previous: unknown): number | null {
  const todayNumber = toNullableNumber(today);
  const previousNumber = toNullableNumber(previous);
  if (todayNumber === null || previousNumber === null || previousNumber === 0) return null;
  return ((todayNumber - previousNumber) / previousNumber) * 100;
}

function difference(today: unknown, previous: unknown): number | null {
  const todayNumber = toNullableNumber(today);
  const previousNumber = toNullableNumber(previous);
  if (todayNumber === null || previousNumber === null) return null;
  return todayNumber - previousNumber;
}

function buildDailyMarketSummaryResponse(row: Record<string, unknown> | null) {
  if (!row) return null;
  const calculated = {
    aspiChange: difference(row.aspi_today, row.aspi_previous),
    aspiChangePercent: percentChange(row.aspi_today, row.aspi_previous),
    spSl20Change: difference(row.sp_sl20_today, row.sp_sl20_previous),
    spSl20ChangePercent: percentChange(row.sp_sl20_today, row.sp_sl20_previous),
    foreignNetFlow: difference(row.foreign_purchases_today, row.foreign_sales_today),
    domesticNetFlow: difference(row.domestic_purchases_today, row.domestic_sales_today),
    turnoverChange: difference(row.equity_turnover_today, row.equity_turnover_previous),
    turnoverChangePercent: percentChange(row.equity_turnover_today, row.equity_turnover_previous),
    marketCapChange: difference(row.market_cap_today, row.market_cap_previous),
    marketCapChangePercent: percentChange(row.market_cap_today, row.market_cap_previous),
    tradedCompanyParticipationPercent:
      toNullableNumber(row.traded_companies_today) !== null && toNullableNumber(row.listed_companies_today)
        ? (Number(row.traded_companies_today) / Number(row.listed_companies_today)) * 100
        : null
  };
  return {
    ...row,
    tradingDate: row.trading_date,
    sourceUrl: row.source_url,
    sourceAsOfText: row.source_as_of_text,
    fetchMode: row.fetch_mode,
    fetchStrategy: row.fetch_strategy,
    rawPayload: row.raw_payload,
    validationReport: row.validation_report,
    warnings: row.warnings_json,
    importRunId: row.import_run_id,
    calculated
  };
}


export const cseAnalyticsService = {
  async latestTradingDate() {
    return resolveDate();
  },

  async getDashboardSummary() {
    const latestDate = await resolveDate();
    const [companyCount, securityCount, fetchRunCount, lastSuccessful, lastFailed, rawDownloadCount, gainersCount, losersCount, turnoverCount] = await Promise.all([
      query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM cse_companies`),
      query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM cse_securities`),
      query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM cse_fetch_runs`),
      query(`SELECT * FROM cse_fetch_runs WHERE status IN ('SUCCESS', 'PARTIAL_SUCCESS') ORDER BY finished_at DESC NULLS LAST, started_at DESC LIMIT 1`),
      query(`SELECT * FROM cse_fetch_runs WHERE status = 'FAILED' ORDER BY finished_at DESC NULLS LAST, started_at DESC LIMIT 1`),
      query<{ count: string }>(`SELECT COALESCE(SUM(letters_successful), 0)::text AS count FROM cse_fetch_runs`),
      latestDate
        ? query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM cse_daily_market_snapshots WHERE trading_date = $1::date AND (change_amount > 0 OR change_percent > 0)`, [latestDate])
        : Promise.resolve({ rows: [{ count: '0' }] }),
      latestDate
        ? query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM cse_daily_market_snapshots WHERE trading_date = $1::date AND (change_amount < 0 OR change_percent < 0)`, [latestDate])
        : Promise.resolve({ rows: [{ count: '0' }] }),
      latestDate
        ? query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM cse_daily_market_snapshots WHERE trading_date = $1::date AND turnover IS NOT NULL`, [latestDate])
        : Promise.resolve({ rows: [{ count: '0' }] })
    ]);

    const successRun = lastSuccessful.rows[0] ?? null;
    const failedRun = lastFailed.rows[0] ?? null;
    let systemStatus: 'Healthy' | 'Warning' | 'Failed' | 'Unknown' = 'Unknown';
    if (!successRun && failedRun) systemStatus = 'Failed';
    else if (!successRun && !latestDate) systemStatus = 'Warning';
    else if (failedRun && successRun && new Date(failedRun.started_at).getTime() > new Date(successRun.started_at).getTime()) systemStatus = 'Warning';
    else if (successRun && latestDate) systemStatus = 'Healthy';
    else if (successRun) systemStatus = 'Warning';

    return {
      companyCount: Number(companyCount.rows[0]?.count ?? 0),
      securityCount: Number(securityCount.rows[0]?.count ?? 0),
      latestMarketSnapshotDate: latestDate,
      lastSuccessfulImport: successRun,
      lastFailedImport: failedRun,
      totalFetchRuns: Number(fetchRunCount.rows[0]?.count ?? 0),
      totalRawDownloadedFiles: Number(rawDownloadCount.rows[0]?.count ?? 0),
      totalGainers: Number(gainersCount.rows[0]?.count ?? 0),
      totalLosers: Number(losersCount.rows[0]?.count ?? 0),
      topTurnoverCount: Number(turnoverCount.rows[0]?.count ?? 0),
      systemStatus
    };
  },

  async listCompanies(options: MarketQueryOptions = {}) {
    const { limit, offset } = normalizePagination(options.page, options.limit);
    const search = options.search?.trim();
    const params: unknown[] = [];
    let where = '';
    if (search) {
      params.push(`%${search.toUpperCase()}%`);
      where = `WHERE c.normalized_name LIKE $${params.length}`;
    }
    params.push(limit, offset);
    const result = await query(
      `SELECT c.*, COUNT(sec.id)::int AS security_count
       FROM cse_companies c
       LEFT JOIN cse_securities sec ON sec.company_id = c.id
       ${where}
       GROUP BY c.id
       ORDER BY c.name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return withFreshness(result.rows);
  },

  async listSecurities(options: MarketQueryOptions = {}) {
    const { limit, offset } = normalizePagination(options.page, options.limit);
    const search = options.search?.trim();
    const params: unknown[] = [];
    let where = '';
    if (search) {
      params.push(`%${search.toUpperCase()}%`);
      where = `WHERE sec.normalized_symbol LIKE $${params.length} OR c.normalized_name LIKE $${params.length}`;
    }
    params.push(limit, offset);
    const result = await query(
      `SELECT
         sec.*,
         c.name AS company_name,
         c.logo_url,
         c.profile_url,
         latest.trading_date::text AS latest_snapshot_date,
         latest.last_traded_price,
         latest.previous_close,
         latest.open_price,
         latest.high_price,
         latest.low_price,
         latest.trade_volume,
         latest.share_volume,
         latest.turnover,
         latest.change_amount,
         latest.change_percent,
         latest.is_watch_list
       FROM cse_securities sec
       JOIN cse_companies c ON c.id = sec.company_id
       LEFT JOIN LATERAL (
         SELECT s.*
         FROM cse_daily_market_snapshots s
         WHERE s.security_id = sec.id
         ORDER BY (s.source_page = 'TRADE_SUMMARY') DESC, s.trading_date DESC
         LIMIT 1
       ) latest ON true
       ${where}
       ORDER BY sec.symbol ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return withFreshness(result.rows);
  },

  async listDaily(options: MarketQueryOptions = {}) {
    const date = await resolveDate(options.date);
    if (!date) return withFreshness([]);
    const { limit, offset } = normalizePagination(options.page, options.limit);
    const params: unknown[] = [date];
    let where = `WHERE s.trading_date = $1::date`;
    const tradeSummaryPreferred = !options.date?.trim();
    if (tradeSummaryPreferred) where += ` AND s.source_page = 'TRADE_SUMMARY'`;
    if (options.search?.trim()) {
      params.push(`%${options.search.trim().toUpperCase()}%`);
      where += ` AND (s.symbol LIKE $${params.length} OR c.normalized_name LIKE $${params.length})`;
    }
    params.push(limit, offset);
    const result = await query(
      `${baseSnapshotSelect()} ${where} ORDER BY s.symbol ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return withFreshness(result.rows);
  },

  async getBySymbol(symbol: string, date?: string) {
    const resolvedDate = await resolveDate(date);
    if (!resolvedDate) return withFreshness(null);
    const result = await query(
      `${baseSnapshotSelect()}
       WHERE s.trading_date = $1::date AND s.symbol = $2
       ORDER BY (s.source_page = 'TRADE_SUMMARY') DESC
       LIMIT 1`,
      [resolvedDate, symbol.trim().toUpperCase()]
    );
    return withFreshness(result.rows[0] ?? null);
  },

  async rank(options: MarketQueryOptions & { type: 'gainers' | 'losers' | 'topTurnover' | 'topTradeVolume' | 'topShareVolume' | 'watchListMovers' }) {
    const date = await resolveDate(options.date);
    if (!date) return withFreshness([]);
    const { limit, offset } = normalizePagination(options.page, options.limit ?? 25);
    const sourceFilter = `s.source_page = 'TRADE_SUMMARY'`;
    const orderMap: Record<'gainers' | 'losers' | 'topTurnover' | 'topTradeVolume' | 'topShareVolume' | 'watchListMovers', string> = {
      gainers: `WHERE s.trading_date = $1::date AND ${sourceFilter} AND (s.change_amount > 0 OR s.change_percent > 0) ORDER BY s.change_percent DESC NULLS LAST, s.change_amount DESC NULLS LAST`,
      losers: `WHERE s.trading_date = $1::date AND ${sourceFilter} AND (s.change_amount < 0 OR s.change_percent < 0) ORDER BY s.change_percent ASC NULLS LAST, s.change_amount ASC NULLS LAST`,
      topTurnover: `WHERE s.trading_date = $1::date AND ${sourceFilter} AND s.turnover IS NOT NULL ORDER BY s.turnover DESC NULLS LAST`,
      topTradeVolume: `WHERE s.trading_date = $1::date AND ${sourceFilter} AND s.trade_volume IS NOT NULL ORDER BY s.trade_volume DESC NULLS LAST`,
      topShareVolume: `WHERE s.trading_date = $1::date AND ${sourceFilter} AND s.share_volume IS NOT NULL ORDER BY s.share_volume DESC NULLS LAST`,
      watchListMovers: `WHERE s.trading_date = $1::date AND ${sourceFilter} AND s.is_watch_list = true ORDER BY ABS(COALESCE(s.change_percent, 0)) DESC NULLS LAST, s.trade_volume DESC NULLS LAST`
    };

    const result = await query(
      `${baseSnapshotSelect()} ${orderMap[options.type]} LIMIT $2 OFFSET $3`,
      [date, limit, offset]
    );
    return withFreshness(result.rows);
  },

  async marketBreadth(options: Pick<MarketQueryOptions, 'date'> = {}) {
    const date = await resolveDate(options.date);
    if (!date) {
      return withFreshness({
        tradingDate: null,
        gainersCount: 0,
        losersCount: 0,
        unchangedCount: 0,
        watchListCount: 0,
        activeSecuritiesCount: 0,
        totalShareVolume: 0,
        totalTradeVolume: 0
      });
    }
    const result = await query(
      `SELECT
         COUNT(*) FILTER (WHERE change_amount > 0 OR change_percent > 0)::int AS gainers_count,
         COUNT(*) FILTER (WHERE change_amount < 0 OR change_percent < 0)::int AS losers_count,
         COUNT(*) FILTER (WHERE COALESCE(change_amount, 0) = 0 AND COALESCE(change_percent, 0) = 0)::int AS unchanged_count,
         COUNT(*) FILTER (WHERE is_watch_list = true)::int AS watch_list_count,
         COUNT(*)::int AS active_securities_count,
         COALESCE(SUM(share_volume), 0)::text AS total_share_volume,
         COALESCE(SUM(trade_volume), 0)::text AS total_trade_volume
       FROM cse_daily_market_snapshots
       WHERE trading_date = $1::date AND source_page = 'TRADE_SUMMARY'`,
      [date]
    );
    const row = result.rows[0] ?? {};
    return withFreshness({
      tradingDate: date,
      gainersCount: Number(row.gainers_count ?? 0),
      losersCount: Number(row.losers_count ?? 0),
      unchangedCount: Number(row.unchanged_count ?? 0),
      watchListCount: Number(row.watch_list_count ?? 0),
      activeSecuritiesCount: Number(row.active_securities_count ?? 0),
      totalShareVolume: Number(row.total_share_volume ?? 0),
      totalTradeVolume: Number(row.total_trade_volume ?? 0)
    });
  }
,

  async latestDailyMarketSummary() {
    const result = await query(`SELECT * FROM cse_daily_market_summaries ORDER BY trading_date DESC LIMIT 1`);
    return buildDailyMarketSummaryResponse(result.rows[0] ?? null);
  },

  async getDailyMarketSummaryByDate(date?: string) {
    if (date?.trim()) {
      const result = await query(`SELECT * FROM cse_daily_market_summaries WHERE trading_date = $1::date LIMIT 1`, [date.trim()]);
      return buildDailyMarketSummaryResponse(result.rows[0] ?? null);
    }
    return this.latestDailyMarketSummary();
  },

  async dailyMarketSummaryHistory(input: { from?: string; to?: string; limit?: number } = {}) {
    const params: unknown[] = [];
    const where: string[] = [];
    if (input.from?.trim()) {
      params.push(input.from.trim());
      where.push(`trading_date >= $${params.length}::date`);
    }
    if (input.to?.trim()) {
      params.push(input.to.trim());
      where.push(`trading_date <= $${params.length}::date`);
    }
    params.push(Math.min(Math.max(input.limit ?? 60, 1), 500));
    const result = await query(
      `SELECT * FROM cse_daily_market_summaries
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY trading_date DESC
       LIMIT $${params.length}`,
      params
    );
    return result.rows.map((row) => buildDailyMarketSummaryResponse(row));
  }

};
