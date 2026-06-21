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
  if (date) return date;
  const result = await query(`SELECT MAX(trading_date)::text AS trading_date FROM cse_daily_market_snapshots`);
  return result.rows[0]?.trading_date ?? null;
}


async function freshnessMeta() {
  const result = await query(`SELECT id, finished_at FROM cse_fetch_runs WHERE status = 'SUCCESS' ORDER BY finished_at DESC NULLS LAST, started_at DESC LIMIT 1`);
  const row = result.rows[0] ?? null;
  const finishedAt = row?.finished_at ? new Date(row.finished_at) : null;
  const isStale = !finishedAt || Date.now() - finishedAt.getTime() > env.CSE_IMPORT_STALE_AFTER_HOURS * 60 * 60 * 1000;
  return {
    lastImportedAt: finishedAt?.toISOString() ?? null,
    lastSuccessfulImportId: row?.id ?? null,
    source: 'CSE Listed Company Directory - ALPHABETICAL' as const,
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
         latest.trade_volume,
         latest.share_volume,
         latest.turnover,
         latest.change_amount,
         latest.change_percent
       FROM cse_securities sec
       JOIN cse_companies c ON c.id = sec.company_id
       LEFT JOIN LATERAL (
         SELECT s.*
         FROM cse_daily_market_snapshots s
         WHERE s.security_id = sec.id
         ORDER BY s.trading_date DESC
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
       LIMIT 1`,
      [resolvedDate, symbol.trim().toUpperCase()]
    );
    return withFreshness(result.rows[0] ?? null);
  },

  async rank(options: MarketQueryOptions & { type: 'gainers' | 'losers' | 'topTurnover' | 'topTradeVolume' | 'topShareVolume' }) {
    const date = await resolveDate(options.date);
    if (!date) return withFreshness([]);
    const { limit, offset } = normalizePagination(options.page, options.limit ?? 25);
    const orderMap: Record<'gainers' | 'losers' | 'topTurnover' | 'topTradeVolume' | 'topShareVolume', string> = {
      gainers: `WHERE s.trading_date = $1::date AND (s.change_amount > 0 OR s.change_percent > 0) ORDER BY s.change_percent DESC NULLS LAST, s.change_amount DESC NULLS LAST`,
      losers: `WHERE s.trading_date = $1::date AND (s.change_amount < 0 OR s.change_percent < 0) ORDER BY s.change_percent ASC NULLS LAST, s.change_amount ASC NULLS LAST`,
      topTurnover: `WHERE s.trading_date = $1::date AND s.turnover IS NOT NULL ORDER BY s.turnover DESC NULLS LAST`,
      topTradeVolume: `WHERE s.trading_date = $1::date AND s.trade_volume IS NOT NULL ORDER BY s.trade_volume DESC NULLS LAST`,
      topShareVolume: `WHERE s.trading_date = $1::date AND s.share_volume IS NOT NULL ORDER BY s.share_volume DESC NULLS LAST`
    };

    const result = await query(
      `${baseSnapshotSelect()} ${orderMap[options.type]} LIMIT $2 OFFSET $3`,
      [date, limit, offset]
    );
    return withFreshness(result.rows);
  }
};
