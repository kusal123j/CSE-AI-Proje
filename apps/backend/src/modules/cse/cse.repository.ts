import { PoolClient } from 'pg';
import { pool, query } from '../../config/database';
import { CseGicsPromotionResult, CseImportValidationReport, ParsedCseAlphabeticalRow, ParsedCseGicsClassificationRow, ParsedCseGicsIndexRow, ParsedCseGicsIndustryGroupRow, ParsedCseGicsSummaryRow, ParsedCseTradeSummaryRow } from './cse.types';

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


async function upsertGicsIndustryGroupWithClient(client: PoolClient, row: ParsedCseGicsIndustryGroupRow, sourceUrl: string) {
  const result = await client.query(
    `INSERT INTO cse_gics_industry_groups (
       industry_group_code, gics_code, symbol, industry_group_name, source_url, first_seen_at, last_seen_at, is_active, raw_row
     ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), true, $6::jsonb)
     ON CONFLICT (industry_group_code)
     DO UPDATE SET
       gics_code = EXCLUDED.gics_code,
       symbol = EXCLUDED.symbol,
       industry_group_name = EXCLUDED.industry_group_name,
       source_url = EXCLUDED.source_url,
       last_seen_at = NOW(),
       is_active = true,
       raw_row = EXCLUDED.raw_row
     RETURNING *, (xmax = 0) AS inserted`,
    [row.industryGroupCode, row.gicsCode, row.symbol, row.industryGroupName, sourceUrl, JSON.stringify(row.rawRow)]
  );
  return result.rows[0];
}

async function findGicsGroupForSummary(client: PoolClient, row: { industryGroupCode?: string; gicsCode?: string; industryGroupName?: string; indexCode?: string }) {
  const result = await client.query(
    `SELECT * FROM cse_gics_industry_groups
     WHERE industry_group_code = $1
        OR gics_code = $2
        OR industry_group_name = $3
        OR industry_group_code = $4
     LIMIT 1`,
    [row.industryGroupCode ?? null, row.gicsCode ?? null, row.industryGroupName ?? null, row.indexCode ?? null]
  );
  return result.rows[0] ?? null;
}

export async function promoteGicsRows(
  runId: string,
  input: {
    tradingDate: string;
    sourceUrl: string;
    industryGroups: ParsedCseGicsIndustryGroupRow[];
    summaryRows: ParsedCseGicsSummaryRow[];
    indexRows: ParsedCseGicsIndexRow[];
    classificationRows: ParsedCseGicsClassificationRow[];
  }
): Promise<CseGicsPromotionResult> {
  const client = await pool.connect();
  const result: CseGicsPromotionResult = {
    industryGroupsCreated: 0,
    industryGroupsUpdated: 0,
    summariesCreated: 0,
    summariesUpdated: 0,
    indicesCreated: 0,
    indicesUpdated: 0,
    classificationsCreated: 0,
    classificationsUpdated: 0,
    classificationSnapshotsCreated: 0,
    classificationSnapshotsUpdated: 0,
    unmappedSymbols: [],
    warnings: []
  };

  try {
    await client.query('BEGIN');

    for (const row of input.industryGroups) {
      const group = await upsertGicsIndustryGroupWithClient(client, row, input.sourceUrl);
      if (group.inserted) result.industryGroupsCreated += 1;
      else result.industryGroupsUpdated += 1;
    }

    for (const row of input.summaryRows) {
      const group = await findGicsGroupForSummary(client, { industryGroupCode: row.industryGroupCode, indexCode: row.indexCode });
      const summary = await client.query(
        `INSERT INTO cse_gics_group_daily_summaries (
           industry_group_id, industry_group_code, gics_code, index_code, trading_date, index_value,
           turnover_value, turnover_volume, trade_volume, per, pbv, dy, companies_traded,
           companies_listed, source_market_date_text, import_run_id, raw_row
         ) VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb)
         ON CONFLICT (industry_group_code, trading_date)
         DO UPDATE SET
           industry_group_id = EXCLUDED.industry_group_id,
           gics_code = EXCLUDED.gics_code,
           index_code = EXCLUDED.index_code,
           index_value = EXCLUDED.index_value,
           turnover_value = EXCLUDED.turnover_value,
           turnover_volume = EXCLUDED.turnover_volume,
           trade_volume = EXCLUDED.trade_volume,
           per = EXCLUDED.per,
           pbv = EXCLUDED.pbv,
           dy = EXCLUDED.dy,
           companies_traded = EXCLUDED.companies_traded,
           companies_listed = EXCLUDED.companies_listed,
           source_market_date_text = EXCLUDED.source_market_date_text,
           import_run_id = EXCLUDED.import_run_id,
           raw_row = EXCLUDED.raw_row
         RETURNING *, (xmax = 0) AS inserted`,
        [
          group?.id ?? null,
          row.industryGroupCode,
          group?.gics_code ?? null,
          row.indexCode,
          input.tradingDate,
          row.indexValue,
          row.turnoverValue,
          row.turnoverVolume,
          row.tradeVolume,
          row.per,
          row.pbv,
          row.dy,
          row.companiesTraded,
          row.companiesListed,
          input.tradingDate,
          runId,
          JSON.stringify(row.rawRow)
        ]
      );
      if (summary.rows[0]?.inserted) result.summariesCreated += 1;
      else result.summariesUpdated += 1;
    }

    for (const row of input.indexRows) {
      const group = await findGicsGroupForSummary(client, { gicsCode: row.gicsCode, industryGroupName: row.industryGroupName, indexCode: row.indexCode });
      const index = await client.query(
        `INSERT INTO cse_gics_group_indices (
           industry_group_id, industry_group_name, index_code, gics_code, trading_date, today_index,
           previous_index, index_change, index_change_percent, turnover_value, turnover_volume,
           trades, source_market_timestamp_text, import_run_id, raw_row
         ) VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)
         ON CONFLICT (index_code, trading_date)
         DO UPDATE SET
           industry_group_id = EXCLUDED.industry_group_id,
           industry_group_name = EXCLUDED.industry_group_name,
           gics_code = EXCLUDED.gics_code,
           today_index = EXCLUDED.today_index,
           previous_index = EXCLUDED.previous_index,
           index_change = EXCLUDED.index_change,
           index_change_percent = EXCLUDED.index_change_percent,
           turnover_value = EXCLUDED.turnover_value,
           turnover_volume = EXCLUDED.turnover_volume,
           trades = EXCLUDED.trades,
           source_market_timestamp_text = EXCLUDED.source_market_timestamp_text,
           import_run_id = EXCLUDED.import_run_id,
           raw_row = EXCLUDED.raw_row
         RETURNING *, (xmax = 0) AS inserted`,
        [
          group?.id ?? null,
          row.industryGroupName,
          row.indexCode,
          row.gicsCode,
          input.tradingDate,
          row.todayIndex,
          row.previousIndex,
          row.indexChange,
          row.indexChangePercent,
          row.turnoverValue,
          row.turnoverVolume,
          row.trades,
          input.tradingDate,
          runId,
          JSON.stringify(row.rawRow)
        ]
      );
      if (index.rows[0]?.inserted) result.indicesCreated += 1;
      else result.indicesUpdated += 1;
    }

    for (const row of input.classificationRows) {
      const group = await findGicsGroupForSummary(client, { industryGroupName: row.industryGroupName });
      const security = await client.query(`SELECT * FROM cse_securities WHERE normalized_symbol = $1 LIMIT 1`, [row.normalizedSymbol]);
      const securityId = security.rows[0]?.id ?? null;
      if (!securityId) result.unmappedSymbols.push(row.normalizedSymbol);

      const classification = await client.query(
        `INSERT INTO cse_security_gics_classifications (
           security_id, symbol, normalized_symbol, company_name, industry_group_id, industry_group_name,
           industry_group_code, gics_code, is_current, first_seen_at, last_seen_at, last_seen_import_run_id, raw_row
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW(), NOW(), $9, $10::jsonb)
         ON CONFLICT (normalized_symbol)
         DO UPDATE SET
           security_id = EXCLUDED.security_id,
           symbol = EXCLUDED.symbol,
           company_name = EXCLUDED.company_name,
           industry_group_id = EXCLUDED.industry_group_id,
           industry_group_name = EXCLUDED.industry_group_name,
           industry_group_code = EXCLUDED.industry_group_code,
           gics_code = EXCLUDED.gics_code,
           is_current = true,
           last_seen_at = NOW(),
           last_seen_import_run_id = EXCLUDED.last_seen_import_run_id,
           raw_row = EXCLUDED.raw_row
         RETURNING *, (xmax = 0) AS inserted`,
        [
          securityId,
          row.symbol,
          row.normalizedSymbol,
          row.companyName,
          group?.id ?? null,
          row.industryGroupName,
          group?.industry_group_code ?? null,
          group?.gics_code ?? null,
          runId,
          JSON.stringify(row.rawRow)
        ]
      );
      if (classification.rows[0]?.inserted) result.classificationsCreated += 1;
      else result.classificationsUpdated += 1;

      const snapshot = await client.query(
        `INSERT INTO cse_gics_classification_snapshots (
           security_id, symbol, normalized_symbol, company_name, industry_group_id, industry_group_name, trading_date,
           last_traded_time, last_traded_price, trade_volume, share_volume, turnover, change_amount,
           change_percent, ytd_change_percent, import_run_id, raw_row
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb)
         ON CONFLICT (normalized_symbol, trading_date, industry_group_id)
         DO UPDATE SET
           security_id = EXCLUDED.security_id,
           symbol = EXCLUDED.symbol,
           company_name = EXCLUDED.company_name,
           industry_group_name = EXCLUDED.industry_group_name,
           last_traded_time = EXCLUDED.last_traded_time,
           last_traded_price = EXCLUDED.last_traded_price,
           trade_volume = EXCLUDED.trade_volume,
           share_volume = EXCLUDED.share_volume,
           turnover = EXCLUDED.turnover,
           change_amount = EXCLUDED.change_amount,
           change_percent = EXCLUDED.change_percent,
           ytd_change_percent = EXCLUDED.ytd_change_percent,
           import_run_id = EXCLUDED.import_run_id,
           raw_row = EXCLUDED.raw_row
         RETURNING *, (xmax = 0) AS inserted`,
        [
          securityId,
          row.symbol,
          row.normalizedSymbol,
          row.companyName,
          group?.id ?? null,
          row.industryGroupName,
          input.tradingDate,
          row.lastTradedTime,
          row.lastTradedPrice,
          row.tradeVolume,
          row.shareVolume,
          row.turnover,
          row.changeAmount,
          row.changePercent,
          row.ytdChangePercent,
          runId,
          JSON.stringify(row.rawRow)
        ]
      );
      if (snapshot.rows[0]?.inserted) result.classificationSnapshotsCreated += 1;
      else result.classificationSnapshotsUpdated += 1;
    }

    await client.query(
      `UPDATE cse_security_gics_classifications
       SET is_current = false
       WHERE is_current = true
         AND (last_seen_import_run_id IS NULL OR last_seen_import_run_id <> $1)`,
      [runId]
    );

    if (result.unmappedSymbols.length > 0) {
      result.warnings.push(`${result.unmappedSymbols.length} GICS symbols were not found in cse_securities and were saved as unmapped warnings.`);
    }

    await client.query('COMMIT');
    return { ...result, unmappedSymbols: Array.from(new Set(result.unmappedSymbols)).sort() };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listGicsGroups() {
  const result = await query(`SELECT * FROM cse_gics_industry_groups WHERE is_active = true ORDER BY industry_group_name ASC`);
  return result.rows;
}

export async function listGicsSummary(limit = 50) {
  const result = await query(
    `SELECT s.*, g.industry_group_name
     FROM cse_gics_group_daily_summaries s
     LEFT JOIN cse_gics_industry_groups g ON g.id = s.industry_group_id
     ORDER BY s.trading_date DESC, COALESCE(s.turnover_value, 0) DESC
     LIMIT $1`,
    [Math.min(Math.max(limit, 1), 500)]
  );
  return result.rows;
}

export async function listGicsIndices(limit = 50) {
  const result = await query(
    `SELECT * FROM cse_gics_group_indices ORDER BY trading_date DESC, industry_group_name ASC LIMIT $1`,
    [Math.min(Math.max(limit, 1), 500)]
  );
  return result.rows;
}

export async function listGicsClassifications(limit = 100, search = '') {
  const result = await query(
    `SELECT c.*, sec.id IS NOT NULL AS is_mapped
     FROM cse_security_gics_classifications c
     LEFT JOIN cse_securities sec ON sec.id = c.security_id
     WHERE c.is_current = true
       AND ($2 = '' OR c.company_name ILIKE '%' || $2 || '%' OR c.normalized_symbol ILIKE '%' || UPPER($2) || '%' OR c.industry_group_name ILIKE '%' || $2 || '%')
     ORDER BY c.industry_group_name ASC, c.normalized_symbol ASC
     LIMIT $1`,
    [Math.min(Math.max(limit, 1), 500), search.trim()]
  );
  return result.rows;
}

export async function listGicsUnmapped() {
  const result = await query(
    `SELECT * FROM cse_security_gics_classifications WHERE is_current = true AND security_id IS NULL ORDER BY normalized_symbol ASC`
  );
  return result.rows;
}

export async function gicsDashboard() {
  const [groups, classifications, unmapped, latestSummary, latestIndex] = await Promise.all([
    query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM cse_gics_industry_groups WHERE is_active = true`),
    query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM cse_security_gics_classifications WHERE is_current = true`),
    query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM cse_security_gics_classifications WHERE is_current = true AND security_id IS NULL`),
    query(`SELECT MAX(trading_date)::text AS trading_date FROM cse_gics_group_daily_summaries`),
    query(`SELECT MAX(trading_date)::text AS trading_date FROM cse_gics_group_indices`)
  ]);
  return {
    groupCount: Number(groups.rows[0]?.count ?? 0),
    classificationCount: Number(classifications.rows[0]?.count ?? 0),
    unmappedCount: Number(unmapped.rows[0]?.count ?? 0),
    latestSummaryDate: latestSummary.rows[0]?.trading_date ?? null,
    latestIndexDate: latestIndex.rows[0]?.trading_date ?? null
  };
}
