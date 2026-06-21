import { query } from '../../config/database';
import { ParsedCseAlphabeticalRow } from './cse.types';

export interface FetchRunInput {
  sourceUrl: string;
  fetchMode: string;
}

export async function createFetchRun(input: FetchRunInput) {
  const result = await query(
    `INSERT INTO cse_fetch_runs (source_url, fetch_mode, status)
     VALUES ($1, $2, 'FAILED')
     RETURNING *`,
    [input.sourceUrl, input.fetchMode]
  );
  return result.rows[0];
}

export async function finishFetchRun(
  runId: string,
  data: {
    status: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED';
    recordsFound: number;
    companiesCreated: number;
    companiesUpdated: number;
    securitiesCreated: number;
    securitiesUpdated: number;
    snapshotsCreated: number;
    snapshotsUpdated: number;
    recordsFailed: number;
    errorMessage?: string | null;
    warnings?: string[];
    rawFilePath?: string | null;
    lettersAttempted?: number;
    lettersSuccessful?: number;
    lettersFailed?: number;
    recordsBeforeDeduplication?: number;
    recordsDeduplicated?: number;
  }
) {
  const result = await query(
    `UPDATE cse_fetch_runs
     SET status = $2,
         finished_at = NOW(),
         records_found = $3,
         companies_created = $4,
         companies_updated = $5,
         securities_created = $6,
         securities_updated = $7,
         snapshots_created = $8,
         snapshots_updated = $9,
         records_failed = $10,
         error_message = $11,
         warnings_json = $12::jsonb,
         raw_file_path = $13,
         letters_attempted = $14,
         letters_successful = $15,
         letters_failed = $16,
         records_before_deduplication = $17,
         records_deduplicated = $18
     WHERE id = $1
     RETURNING *`,
    [
      runId,
      data.status,
      data.recordsFound,
      data.companiesCreated,
      data.companiesUpdated,
      data.securitiesCreated,
      data.securitiesUpdated,
      data.snapshotsCreated,
      data.snapshotsUpdated,
      data.recordsFailed,
      data.errorMessage ?? null,
      JSON.stringify(data.warnings ?? []),
      data.rawFilePath ?? null,
      data.lettersAttempted ?? null,
      data.lettersSuccessful ?? null,
      data.lettersFailed ?? null,
      data.recordsBeforeDeduplication ?? null,
      data.recordsDeduplicated ?? null
    ]
  );
  return result.rows[0];
}

export async function upsertCompany(row: ParsedCseAlphabeticalRow) {
  const result = await query(
    `INSERT INTO cse_companies (name, normalized_name, profile_url, logo_url, first_seen_at, last_seen_at, is_active)
     VALUES ($1, $2, $3, $4, NOW(), NOW(), true)
     ON CONFLICT (normalized_name)
     DO UPDATE SET
       name = EXCLUDED.name,
       profile_url = COALESCE(EXCLUDED.profile_url, cse_companies.profile_url),
       logo_url = COALESCE(EXCLUDED.logo_url, cse_companies.logo_url),
       last_seen_at = NOW(),
       is_active = true
     RETURNING *, (xmax = 0) AS inserted`,
    [row.companyName, row.normalizedCompanyName, row.profileUrl, row.logoUrl]
  );
  return result.rows[0];
}

export async function upsertSecurity(companyId: string, row: ParsedCseAlphabeticalRow) {
  const result = await query(
    `INSERT INTO cse_securities (company_id, symbol, normalized_symbol, first_seen_at, last_seen_at, is_active)
     VALUES ($1, $2, $3, NOW(), NOW(), true)
     ON CONFLICT (symbol)
     DO UPDATE SET
       company_id = EXCLUDED.company_id,
       normalized_symbol = EXCLUDED.normalized_symbol,
       last_seen_at = NOW(),
       is_active = true
     RETURNING *, (xmax = 0) AS inserted`,
    [companyId, row.symbol, row.normalizedSymbol]
  );
  return result.rows[0];
}

export async function upsertDailySnapshot(securityId: string, row: ParsedCseAlphabeticalRow, tradingDate: string) {
  const result = await query(
    `INSERT INTO cse_daily_market_snapshots (
       security_id, symbol, trading_date, last_traded_price, trade_volume, share_volume,
       turnover, change_amount, change_percent, raw_row, fetched_at
     ) VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW())
     ON CONFLICT (symbol, trading_date)
     DO UPDATE SET
       security_id = EXCLUDED.security_id,
       last_traded_price = EXCLUDED.last_traded_price,
       trade_volume = EXCLUDED.trade_volume,
       share_volume = EXCLUDED.share_volume,
       turnover = EXCLUDED.turnover,
       change_amount = EXCLUDED.change_amount,
       change_percent = EXCLUDED.change_percent,
       raw_row = EXCLUDED.raw_row,
       fetched_at = NOW()
     RETURNING *, (xmax = 0) AS inserted`,
    [
      securityId,
      row.symbol,
      tradingDate,
      row.lastTradedPrice,
      row.tradeVolume,
      row.shareVolume,
      row.turnover,
      row.changeAmount,
      row.changePercent,
      JSON.stringify(row.rawRow)
    ]
  );
  return result.rows[0];
}

export async function listFetchRuns(limit = 25) {
  const result = await query(
    `SELECT * FROM cse_fetch_runs ORDER BY started_at DESC LIMIT $1`,
    [Math.min(Math.max(limit, 1), 100)]
  );
  return result.rows;
}

export async function findFetchRun(id: string) {
  const result = await query(`SELECT * FROM cse_fetch_runs WHERE id = $1 LIMIT 1`, [id]);
  return result.rows[0] ?? null;
}

export async function latestFetchRun() {
  const result = await query(`SELECT * FROM cse_fetch_runs ORDER BY started_at DESC LIMIT 1`);
  return result.rows[0] ?? null;
}

export async function latestTradingDate(): Promise<string | null> {
  const result = await query(`SELECT MAX(trading_date)::text AS trading_date FROM cse_daily_market_snapshots`);
  return result.rows[0]?.trading_date ?? null;
}
