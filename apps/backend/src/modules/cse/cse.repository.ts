import { PoolClient } from 'pg';
import { pool, query } from '../../config/database';
import { CseImportValidationReport, ParsedCseAlphabeticalRow, ParsedCseTradeSummaryRow } from './cse.types';

export interface FetchRunInput {
  sourceUrl: string;
  fetchMode: string;
  triggerType?: 'manual' | 'scheduled';
  source?: string;
}

export interface PromotionResult {
  companiesCreated: number;
  companiesUpdated: number;
  securitiesCreated: number;
  securitiesUpdated: number;
  snapshotsCreated: number;
  snapshotsUpdated: number;
}

export async function createFetchRun(input: FetchRunInput) {
  const result = await query(
    `INSERT INTO cse_fetch_runs (source, source_url, fetch_mode, trigger_type, status)
     VALUES ($4, $1, $2, $3, 'RUNNING')
     RETURNING *`,
    [input.sourceUrl, input.fetchMode, input.triggerType ?? 'manual', input.source ?? 'CSE_ALPHABETICAL']
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
    validationReport?: CseImportValidationReport | null;
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
         records_deduplicated = $18,
         validation_report = $19::jsonb,
         promoted_at = CASE WHEN $2 IN ('SUCCESS', 'PARTIAL_SUCCESS') THEN NOW() ELSE promoted_at END
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
      data.recordsDeduplicated ?? null,
      JSON.stringify(data.validationReport ?? null)
    ]
  );
  return result.rows[0];
}

async function upsertCompanyWithClient(client: PoolClient, row: ParsedCseAlphabeticalRow, runId: string) {
  const result = await client.query(
    `INSERT INTO cse_companies (name, normalized_name, profile_url, logo_url, first_seen_at, last_seen_at, last_seen_import_run_id, is_active)
     VALUES ($1, $2, $3, $4, NOW(), NOW(), $5, true)
     ON CONFLICT (normalized_name)
     DO UPDATE SET
       name = EXCLUDED.name,
       profile_url = COALESCE(EXCLUDED.profile_url, cse_companies.profile_url),
       logo_url = COALESCE(EXCLUDED.logo_url, cse_companies.logo_url),
       last_seen_at = NOW(),
       last_seen_import_run_id = EXCLUDED.last_seen_import_run_id,
       is_active = true
     RETURNING *, (xmax = 0) AS inserted`,
    [row.companyName, row.normalizedCompanyName, row.profileUrl, row.logoUrl, runId]
  );
  return result.rows[0];
}

async function upsertSecurityWithClient(client: PoolClient, companyId: string, row: ParsedCseAlphabeticalRow, runId: string) {
  const result = await client.query(
    `INSERT INTO cse_securities (company_id, symbol, normalized_symbol, first_seen_at, last_seen_at, last_seen_import_run_id, is_active)
     VALUES ($1, $2, $3, NOW(), NOW(), $4, true)
     ON CONFLICT (normalized_symbol)
     DO UPDATE SET
       company_id = EXCLUDED.company_id,
       symbol = EXCLUDED.symbol,
       last_seen_at = NOW(),
       last_seen_import_run_id = EXCLUDED.last_seen_import_run_id,
       is_active = true
     RETURNING *, (xmax = 0) AS inserted`,
    [companyId, row.symbol, row.normalizedSymbol, runId]
  );
  return result.rows[0];
}

async function upsertDailySnapshotWithClient(client: PoolClient, securityId: string, row: ParsedCseAlphabeticalRow, tradingDate: string, runId: string) {
  const result = await client.query(
    `INSERT INTO cse_daily_market_snapshots (
       security_id, symbol, trading_date, last_traded_price, trade_volume, share_volume,
       turnover, change_amount, change_percent, import_run_id, raw_row, fetched_at
     ) VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, NOW())
     ON CONFLICT (symbol, trading_date)
     DO UPDATE SET
       security_id = EXCLUDED.security_id,
       last_traded_price = EXCLUDED.last_traded_price,
       trade_volume = EXCLUDED.trade_volume,
       share_volume = EXCLUDED.share_volume,
       turnover = EXCLUDED.turnover,
       change_amount = EXCLUDED.change_amount,
       change_percent = EXCLUDED.change_percent,
       import_run_id = EXCLUDED.import_run_id,
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
      runId,
      JSON.stringify(row.rawRow)
    ]
  );
  return result.rows[0];
}

export async function saveAlphabeticalRowsToStage(runId: string, rows: ParsedCseAlphabeticalRow[], tradingDate: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM cse_import_stage_market_snapshots WHERE import_run_id = $1', [runId]);
    await client.query('DELETE FROM cse_import_stage_securities WHERE import_run_id = $1', [runId]);
    await client.query('DELETE FROM cse_import_stage_companies WHERE import_run_id = $1', [runId]);

    const seenCompanies = new Set<string>();
    const seenSecurities = new Set<string>();
    for (const row of rows) {
      if (!seenCompanies.has(row.normalizedCompanyName)) {
        await client.query(
          `INSERT INTO cse_import_stage_companies (import_run_id, company_name, normalized_name, profile_url, logo_url)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (import_run_id, normalized_name) DO UPDATE SET
             company_name = EXCLUDED.company_name,
             profile_url = COALESCE(EXCLUDED.profile_url, cse_import_stage_companies.profile_url),
             logo_url = COALESCE(EXCLUDED.logo_url, cse_import_stage_companies.logo_url)`,
          [runId, row.companyName, row.normalizedCompanyName, row.profileUrl, row.logoUrl]
        );
        seenCompanies.add(row.normalizedCompanyName);
      }

      if (!seenSecurities.has(row.normalizedSymbol)) {
        await client.query(
          `INSERT INTO cse_import_stage_securities (import_run_id, normalized_name, symbol, normalized_symbol)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (import_run_id, normalized_symbol) DO UPDATE SET
             normalized_name = EXCLUDED.normalized_name,
             symbol = EXCLUDED.symbol`,
          [runId, row.normalizedCompanyName, row.symbol, row.normalizedSymbol]
        );
        seenSecurities.add(row.normalizedSymbol);
      }

      await client.query(
        `INSERT INTO cse_import_stage_market_snapshots (
           import_run_id, normalized_symbol, symbol, trading_date, last_traded_price, trade_volume,
           share_volume, turnover, change_amount, change_percent, source_letter, raw_row
         ) VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
         ON CONFLICT (import_run_id, normalized_symbol, trading_date) DO UPDATE SET
           symbol = EXCLUDED.symbol,
           last_traded_price = EXCLUDED.last_traded_price,
           trade_volume = EXCLUDED.trade_volume,
           share_volume = EXCLUDED.share_volume,
           turnover = EXCLUDED.turnover,
           change_amount = EXCLUDED.change_amount,
           change_percent = EXCLUDED.change_percent,
           source_letter = EXCLUDED.source_letter,
           raw_row = EXCLUDED.raw_row`,
        [
          runId,
          row.normalizedSymbol,
          row.symbol,
          tradingDate,
          row.lastTradedPrice,
          row.tradeVolume,
          row.shareVolume,
          row.turnover,
          row.changeAmount,
          row.changePercent,
          row.sourceLetter ?? null,
          JSON.stringify(row.rawRow)
        ]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function rowFromStage(row: Record<string, unknown>): ParsedCseAlphabeticalRow {
  return {
    companyName: String(row.company_name ?? ''),
    normalizedCompanyName: String(row.normalized_name ?? ''),
    symbol: String(row.symbol ?? ''),
    normalizedSymbol: String(row.normalized_symbol ?? ''),
    board: null,
    sector: null,
    profileUrl: (row.profile_url as string | null) ?? null,
    logoUrl: (row.logo_url as string | null) ?? null,
    lastTradedPrice: row.last_traded_price === null || row.last_traded_price === undefined ? null : Number(row.last_traded_price),
    tradeVolume: row.trade_volume === null || row.trade_volume === undefined ? null : Number(row.trade_volume),
    shareVolume: row.share_volume === null || row.share_volume === undefined ? null : Number(row.share_volume),
    turnover: row.turnover === null || row.turnover === undefined ? null : Number(row.turnover),
    changeAmount: row.change_amount === null || row.change_amount === undefined ? null : Number(row.change_amount),
    changePercent: row.change_percent === null || row.change_percent === undefined ? null : Number(row.change_percent),
    sourceLetter: (row.source_letter as string | null) ?? undefined,
    rawRow: (row.raw_row as Record<string, unknown> | null) ?? {}
  };
}

export async function promoteStagedAlphabeticalRows(runId: string): Promise<PromotionResult> {
  const client = await pool.connect();
  const result: PromotionResult = {
    companiesCreated: 0,
    companiesUpdated: 0,
    securitiesCreated: 0,
    securitiesUpdated: 0,
    snapshotsCreated: 0,
    snapshotsUpdated: 0
  };

  try {
    await client.query('BEGIN');
    const stageRows = await client.query(
      `SELECT
         c.company_name,
         c.normalized_name,
         c.profile_url,
         c.logo_url,
         sec.symbol,
         sec.normalized_symbol,
         snap.trading_date::text AS trading_date,
         snap.last_traded_price,
         snap.trade_volume,
         snap.share_volume,
         snap.turnover,
         snap.change_amount,
         snap.change_percent,
         snap.source_letter,
         snap.raw_row
       FROM cse_import_stage_market_snapshots snap
       JOIN cse_import_stage_securities sec
         ON sec.import_run_id = snap.import_run_id
        AND sec.normalized_symbol = snap.normalized_symbol
       JOIN cse_import_stage_companies c
         ON c.import_run_id = sec.import_run_id
        AND c.normalized_name = sec.normalized_name
       WHERE snap.import_run_id = $1
       ORDER BY sec.normalized_symbol ASC`,
      [runId]
    );

    for (const rawStageRow of stageRows.rows) {
      const row = rowFromStage(rawStageRow);
      const company = await upsertCompanyWithClient(client, row, runId);
      if (company.inserted) result.companiesCreated += 1;
      else result.companiesUpdated += 1;

      const security = await upsertSecurityWithClient(client, company.id, row, runId);
      if (security.inserted) result.securitiesCreated += 1;
      else result.securitiesUpdated += 1;

      const snapshot = await upsertDailySnapshotWithClient(client, security.id, row, String(rawStageRow.trading_date), runId);
      if (snapshot.inserted) result.snapshotsCreated += 1;
      else result.snapshotsUpdated += 1;
    }

    await client.query(
      `UPDATE cse_securities
       SET is_active = false
       WHERE is_active = true
         AND (last_seen_import_run_id IS NULL OR last_seen_import_run_id <> $1)`,
      [runId]
    );

    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function promoteAlphabeticalRows(runId: string, rows: ParsedCseAlphabeticalRow[], tradingDate: string): Promise<PromotionResult> {
  await saveAlphabeticalRowsToStage(runId, rows, tradingDate);
  return promoteStagedAlphabeticalRows(runId);
}

export async function saveImportArtifact(input: {
  runId: string;
  letter?: string | null;
  artifactType: string;
  filePath: string;
  checksum?: string | null;
  rowCount?: number | null;
}) {
  const result = await query(
    `INSERT INTO cse_import_artifacts (import_run_id, letter, artifact_type, file_path, checksum, row_count)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [input.runId, input.letter ?? null, input.artifactType, input.filePath, input.checksum ?? null, input.rowCount ?? null]
  );
  return result.rows[0];
}

export async function listImportArtifacts(runId: string) {
  const result = await query(
    `SELECT * FROM cse_import_artifacts WHERE import_run_id = $1 ORDER BY letter NULLS LAST, created_at ASC`,
    [runId]
  );
  return result.rows;
}

export async function listFetchRuns(limit = 25) {
  const result = await query(`SELECT * FROM cse_fetch_runs ORDER BY started_at DESC LIMIT $1`, [Math.min(Math.max(limit, 1), 100)]);
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

export async function latestSuccessfulFetchRun() {
  const result = await query(`SELECT * FROM cse_fetch_runs WHERE status = 'SUCCESS' ORDER BY finished_at DESC NULLS LAST, started_at DESC LIMIT 1`);
  return result.rows[0] ?? null;
}

export async function countRunningFetchRuns() {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM cse_fetch_runs
     WHERE status = 'RUNNING'
       AND started_at > NOW() - INTERVAL '45 minutes'`
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function latestTradingDate(): Promise<string | null> {
  const result = await query(`SELECT MAX(trading_date)::text AS trading_date FROM cse_daily_market_snapshots`);
  return result.rows[0]?.trading_date ?? null;
}
function tradeSummaryCompanyRow(row: ParsedCseTradeSummaryRow): ParsedCseAlphabeticalRow {
  return {
    companyName: row.companyName,
    normalizedCompanyName: row.normalizedCompanyName,
    symbol: row.symbol,
    normalizedSymbol: row.normalizedSymbol,
    profileUrl: null,
    logoUrl: null,
    lastTradedPrice: row.lastTradedPrice,
    tradeVolume: row.tradeVolume,
    shareVolume: row.shareVolume,
    turnover: row.turnover ?? null,
    changeAmount: row.changeAmount,
    changePercent: row.changePercent,
    rawRow: row.rawRow
  };
}

async function upsertTradeSummarySnapshotWithClient(
  client: PoolClient,
  securityId: string,
  row: ParsedCseTradeSummaryRow,
  tradingDate: string,
  runId: string,
  marketTimestamp?: string | null,
  sourceMarketTimestampText?: string | null
) {
  const result = await client.query(
    `INSERT INTO cse_daily_market_snapshots (
       security_id, symbol, trading_date, last_traded_price, previous_close, open_price, high_price,
       low_price, trade_volume, share_volume, turnover, change_amount, change_percent, is_watch_list,
       market_timestamp, source_market_timestamp_text, import_run_id, source_page, raw_row, fetched_at
     ) VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::timestamptz, $16, $17, 'TRADE_SUMMARY', $18::jsonb, NOW())
     ON CONFLICT (symbol, trading_date)
     DO UPDATE SET
       security_id = EXCLUDED.security_id,
       last_traded_price = EXCLUDED.last_traded_price,
       previous_close = EXCLUDED.previous_close,
       open_price = EXCLUDED.open_price,
       high_price = EXCLUDED.high_price,
       low_price = EXCLUDED.low_price,
       trade_volume = EXCLUDED.trade_volume,
       share_volume = EXCLUDED.share_volume,
       turnover = EXCLUDED.turnover,
       change_amount = EXCLUDED.change_amount,
       change_percent = EXCLUDED.change_percent,
       is_watch_list = EXCLUDED.is_watch_list,
       market_timestamp = EXCLUDED.market_timestamp,
       source_market_timestamp_text = EXCLUDED.source_market_timestamp_text,
       import_run_id = EXCLUDED.import_run_id,
       source_page = EXCLUDED.source_page,
       raw_row = EXCLUDED.raw_row,
       fetched_at = NOW()
     RETURNING *, (xmax = 0) AS inserted`,
    [
      securityId,
      row.symbol,
      tradingDate,
      row.lastTradedPrice,
      row.previousClose,
      row.openPrice,
      row.highPrice,
      row.lowPrice,
      row.tradeVolume,
      row.shareVolume,
      row.turnover ?? null,
      row.changeAmount,
      row.changePercent,
      row.isWatchList,
      marketTimestamp ?? null,
      sourceMarketTimestampText ?? null,
      runId,
      JSON.stringify({ ...row.rawRow, sourcePage: 'TRADE_SUMMARY', sourceMarketTimestampText: sourceMarketTimestampText ?? null, watchListDetectionSource: row.watchListDetectionSource ?? null })
    ]
  );
  return result.rows[0];
}

export async function promoteTradeSummaryRows(
  runId: string,
  rows: ParsedCseTradeSummaryRow[],
  tradingDate: string,
  options: { marketTimestamp?: string | null; sourceMarketTimestampText?: string | null } = {}
): Promise<PromotionResult & { warnings: string[] }> {
  const client = await pool.connect();
  const result: PromotionResult & { warnings: string[] } = {
    companiesCreated: 0,
    companiesUpdated: 0,
    securitiesCreated: 0,
    securitiesUpdated: 0,
    snapshotsCreated: 0,
    snapshotsUpdated: 0,
    warnings: []
  };

  try {
    await client.query('BEGIN');
    for (const row of rows) {
      const companyRow = tradeSummaryCompanyRow(row);
      const existingSecurity = await client.query(`SELECT sec.*, c.id AS company_id FROM cse_securities sec JOIN cse_companies c ON c.id = sec.company_id WHERE sec.normalized_symbol = $1 LIMIT 1`, [row.normalizedSymbol]);
      let company;
      let security;

      if (existingSecurity.rows[0]) {
        security = existingSecurity.rows[0];
        const updatedCompany = await upsertCompanyWithClient(client, companyRow, runId);
        company = updatedCompany;
        if (updatedCompany.inserted) result.companiesCreated += 1;
        else result.companiesUpdated += 1;
        const updatedSecurity = await upsertSecurityWithClient(client, company.id, companyRow, runId);
        security = updatedSecurity;
        if (updatedSecurity.inserted) result.securitiesCreated += 1;
        else result.securitiesUpdated += 1;
      } else {
        result.warnings.push(`Unknown Trade Summary symbol ${row.symbol}; created placeholder company/security from Trade Summary row.`);
        company = await upsertCompanyWithClient(client, companyRow, runId);
        if (company.inserted) result.companiesCreated += 1;
        else result.companiesUpdated += 1;
        security = await upsertSecurityWithClient(client, company.id, companyRow, runId);
        if (security.inserted) result.securitiesCreated += 1;
        else result.securitiesUpdated += 1;
      }

      const snapshot = await upsertTradeSummarySnapshotWithClient(
        client,
        security.id,
        row,
        tradingDate,
        runId,
        options.marketTimestamp ?? null,
        options.sourceMarketTimestampText ?? null
      );
      if (snapshot.inserted) result.snapshotsCreated += 1;
      else result.snapshotsUpdated += 1;
    }
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

