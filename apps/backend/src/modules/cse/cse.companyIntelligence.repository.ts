import { PoolClient } from 'pg';
import { pool, query } from '../../config/database';
import { assertAllowedCsePdfUrl, normalizeCsePdfUrl } from './cse.sourceGuard';
import {
  CseAnnouncementInput,
  CseCompanyImportType,
  CseCompanyPersonInput,
  CseCompanyProfileInput,
  CseFinancialReportInput,
  CseLatestPriceInput
} from './cse.companyIntelligence.types';

export interface CseSecurityIdentity {
  companyId: string;
  securityId: string;
  symbol: string;
  companyName: string;
}

function upperSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function documentTypeForReport(reportType: string): 'ANNUAL_REPORT' | 'INTERIM_REPORT' | 'OTHER' {
  const normalized = reportType.trim().toUpperCase();
  if (normalized === 'ANNUAL_REPORT') return 'ANNUAL_REPORT';
  if (normalized === 'QUARTERLY_REPORT' || normalized === 'INTERIM_REPORT') return 'INTERIM_REPORT';
  return 'OTHER';
}

function documentTypeForAnnouncement(category?: string | null): 'ANNOUNCEMENT' | 'CIRCULAR' {
  return String(category ?? '').toLowerCase().includes('circular') ? 'CIRCULAR' : 'ANNOUNCEMENT';
}

function compactJson(value: unknown) {
  return JSON.stringify(value ?? {});
}

function normalizeIncomingPdfUrl(value?: string | null): string | null {
  return normalizeCsePdfUrl(value ?? null);
}


export async function listActiveCseSecurities(limit?: number): Promise<CseSecurityIdentity[]> {
  const params: unknown[] = [];
  const limitSql = limit && limit > 0 ? `LIMIT $${params.push(limit)}` : '';
  const result = await query(
    `SELECT s.company_id AS "companyId",
            s.id AS "securityId",
            s.symbol,
            c.name AS "companyName"
       FROM cse_securities s
       JOIN cse_companies c ON c.id = s.company_id
      WHERE s.is_active = true
      ORDER BY s.normalized_symbol ASC
      ${limitSql}`,
    params
  );
  return result.rows as CseSecurityIdentity[];
}

export async function findCseSecurityBySymbol(symbol: string): Promise<CseSecurityIdentity | null> {
  const result = await query(
    `SELECT s.company_id AS "companyId",
            s.id AS "securityId",
            s.symbol,
            c.name AS "companyName"
       FROM cse_securities s
       JOIN cse_companies c ON c.id = s.company_id
      WHERE s.normalized_symbol = $1
      LIMIT 1`,
    [upperSymbol(symbol)]
  );
  return (result.rows[0] as CseSecurityIdentity | undefined) ?? null;
}

export async function upsertCompanyProfile(identity: CseSecurityIdentity, input: CseCompanyProfileInput) {
  const result = await query(
    `INSERT INTO cse_company_profiles (
       company_id, security_id, symbol, company_name, isin, logo_url, business_summary,
       gics_industry_group, founded_year, quoted_date, financial_year_end, board,
       address, email, phone, fax, website, company_secretaries, auditors,
       articles_of_association_url, source_url, raw_payload_hash, raw_payload_json,
       warnings_json, last_profile_fetched_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10, $11, $12,
       $13, $14, $15, $16, $17, $18, $19,
       $20, $21, $22, $23::jsonb,
       $24::jsonb, NOW()
     )
     ON CONFLICT (symbol)
     DO UPDATE SET
       company_id = EXCLUDED.company_id,
       security_id = EXCLUDED.security_id,
       company_name = EXCLUDED.company_name,
       isin = EXCLUDED.isin,
       logo_url = EXCLUDED.logo_url,
       business_summary = EXCLUDED.business_summary,
       gics_industry_group = EXCLUDED.gics_industry_group,
       founded_year = EXCLUDED.founded_year,
       quoted_date = EXCLUDED.quoted_date,
       financial_year_end = EXCLUDED.financial_year_end,
       board = EXCLUDED.board,
       address = EXCLUDED.address,
       email = EXCLUDED.email,
       phone = EXCLUDED.phone,
       fax = EXCLUDED.fax,
       website = EXCLUDED.website,
       company_secretaries = EXCLUDED.company_secretaries,
       auditors = EXCLUDED.auditors,
       articles_of_association_url = EXCLUDED.articles_of_association_url,
       source_url = EXCLUDED.source_url,
       raw_payload_hash = EXCLUDED.raw_payload_hash,
       raw_payload_json = EXCLUDED.raw_payload_json,
       warnings_json = EXCLUDED.warnings_json,
       last_profile_fetched_at = NOW()
     RETURNING *`,
    [
      identity.companyId,
      identity.securityId,
      upperSymbol(input.symbol),
      input.companyName || identity.companyName,
      input.isin ?? null,
      input.logoUrl ?? null,
      input.businessSummary ?? null,
      input.gicsIndustryGroup ?? null,
      input.foundedYear ?? null,
      input.quotedDate ?? null,
      input.financialYearEnd ?? null,
      input.board ?? null,
      input.address ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.fax ?? null,
      input.website ?? null,
      input.companySecretaries ?? null,
      input.auditors ?? null,
      input.articlesOfAssociationUrl ?? null,
      input.sourceUrl,
      input.rawPayloadHash ?? null,
      compactJson(input.rawPayload ?? {}),
      JSON.stringify(input.warnings ?? [])
    ]
  );
  return result.rows[0];
}

export async function insertCompanyProfileSnapshot(identity: CseSecurityIdentity, profileId: string, input: CseCompanyProfileInput) {
  const result = await query(
    `INSERT INTO cse_company_profile_snapshots (
       profile_id, company_id, security_id, symbol, source_url, source_type,
       raw_payload_json, normalized_payload_json, payload_hash, fetched_at
     ) VALUES ($1, $2, $3, $4, $5, 'company-profile', $6::jsonb, $7::jsonb, $8, NOW())
     RETURNING *`,
    [
      profileId,
      identity.companyId,
      identity.securityId,
      upperSymbol(input.symbol),
      input.sourceUrl,
      compactJson(input.rawPayload ?? {}),
      compactJson(input),
      input.rawPayloadHash ?? null
    ]
  );
  return result.rows[0];
}

export async function replaceCompanyPeople(identity: CseSecurityIdentity, people: CseCompanyPersonInput[], sourceUrl: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE cse_company_people SET is_current = false WHERE symbol = $1`, [identity.symbol]);
    const rows = [];
    for (const person of people) {
      if (!person.personName?.trim()) continue;
      const result = await client.query(
        `INSERT INTO cse_company_people (
           company_id, security_id, symbol, person_name, designation, role_group,
           is_current, source_url, raw_row_json
         ) VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8::jsonb)
         ON CONFLICT (symbol, person_name, role_group)
         DO UPDATE SET
           company_id = EXCLUDED.company_id,
           security_id = EXCLUDED.security_id,
           designation = EXCLUDED.designation,
           is_current = true,
           source_url = EXCLUDED.source_url,
           raw_row_json = EXCLUDED.raw_row_json
         RETURNING *`,
        [
          identity.companyId,
          identity.securityId,
          identity.symbol,
          person.personName.trim(),
          person.designation ?? null,
          person.roleGroup ?? 'OTHER',
          sourceUrl,
          compactJson(person.rawRow ?? {})
        ]
      );
      rows.push(result.rows[0]);
    }
    await client.query('COMMIT');
    return rows;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function findOrCreateCseDocument(
  client: PoolClient,
  identity: CseSecurityIdentity,
  input: {
    documentType: 'ANNUAL_REPORT' | 'INTERIM_REPORT' | 'ANNOUNCEMENT' | 'CIRCULAR' | 'OTHER';
    title: string;
    sourceUrl?: string | null;
    sourceDocumentId?: string | null;
    financialYear?: string | null;
    period?: string | null;
    publishedDate?: string | null;
  }
) {
  const normalizedSourceUrl = input.sourceUrl ? assertAllowedCsePdfUrl(input.sourceUrl) : null;
  if (normalizedSourceUrl) {
    const existingBySource = await client.query(`SELECT * FROM documents WHERE source_url = $1 LIMIT 1`, [normalizedSourceUrl]);
    if (existingBySource.rows[0]) return existingBySource.rows[0];
  }

  await client.query('SAVEPOINT cse_document_insert');
  try {
    const result = await client.query(
      `INSERT INTO documents (
         company_id, cse_company_id, cse_security_id, symbol, document_type, title,
         source_url, source_document_id, financial_year, period, published_date, file_name
       ) VALUES (NULL, $1, $2, $3, $4::document_type, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (source_url)
       DO UPDATE SET
         cse_company_id = COALESCE(documents.cse_company_id, EXCLUDED.cse_company_id),
         cse_security_id = COALESCE(documents.cse_security_id, EXCLUDED.cse_security_id),
         source_url = EXCLUDED.source_url,
         title = COALESCE(NULLIF(EXCLUDED.title, ''), documents.title)
       RETURNING *`,
      [
        identity.companyId,
        identity.securityId,
        identity.symbol,
        input.documentType,
        input.title,
        normalizedSourceUrl,
        input.sourceDocumentId ?? null,
        input.financialYear ?? null,
        input.period ?? null,
        input.publishedDate ?? null,
        normalizedSourceUrl ? normalizedSourceUrl.split('/').pop()?.split('?')[0] ?? null : null
      ]
    );
    await client.query('RELEASE SAVEPOINT cse_document_insert');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT cse_document_insert');
    await client.query('RELEASE SAVEPOINT cse_document_insert').catch(() => undefined);
    const pgCode = (error as { code?: string }).code;
    if (pgCode === '23505' && normalizedSourceUrl) {
      const existingBySource = await client.query(`SELECT * FROM documents WHERE source_url = $1 LIMIT 1`, [normalizedSourceUrl]);
      if (existingBySource.rows[0]) return existingBySource.rows[0];
    }
    if (pgCode === '23505') {
      const existingByBusinessKey = await client.query(
        `SELECT * FROM documents
          WHERE symbol = $1
            AND document_type = $2::document_type
            AND COALESCE(financial_year, '') = COALESCE($3, '')
            AND COALESCE(period, '') = COALESCE($4, '')
            AND status <> 'DUPLICATE'::document_status
          ORDER BY created_at DESC
          LIMIT 1`,
        [identity.symbol, input.documentType, input.financialYear ?? null, input.period ?? null]
      );
      const businessDuplicate = existingByBusinessKey.rows[0];
      if (businessDuplicate && normalizedSourceUrl) {
        const duplicateInsert = await client.query(
          `INSERT INTO documents (
             company_id, cse_company_id, cse_security_id, symbol, document_type, title,
             source_url, source_document_id, financial_year, period, published_date, file_name,
             is_duplicate, duplicate_of_document_id, duplicate_reason
           ) VALUES (NULL, $1, $2, $3, $4::document_type, $5, $6, $7, $8, $9, $10, $11, true, $12, 'BUSINESS_KEY_CONFLICT_DISTINCT_SOURCE_URL')
           ON CONFLICT (source_url)
           DO UPDATE SET source_url = EXCLUDED.source_url
           RETURNING *`,
          [
            identity.companyId,
            identity.securityId,
            identity.symbol,
            input.documentType,
            input.title,
            normalizedSourceUrl,
            input.sourceDocumentId ?? null,
            input.financialYear ?? null,
            input.period ?? null,
            input.publishedDate ?? null,
            normalizedSourceUrl.split('/').pop()?.split('?')[0] ?? null,
            businessDuplicate.id
          ]
        );
        return duplicateInsert.rows[0];
      }
      if (businessDuplicate) return businessDuplicate;
    }
    throw error;
  }
}

function retryPdfSourceFromRow(row: { pdf_url?: string | null; original_pdf_url?: string | null }, label: string): string {
  const preferred = normalizeCsePdfUrl(row.pdf_url ?? null);
  if (preferred) return preferred;
  const fallback = normalizeCsePdfUrl(row.original_pdf_url ?? null);
  if (fallback) return fallback;
  throw new Error(`${label} has no valid CSE CDN PDF URL to retry.`);
}

export async function upsertFinancialReport(identity: CseSecurityIdentity, input: CseFinancialReportInput) {
  const client = await pool.connect();
  const normalizedPdfUrl = normalizeIncomingPdfUrl(input.pdfUrl);
  const originalPdfUrl = input.originalPdfUrl ?? input.pdfUrl ?? null;
  try {
    await client.query('BEGIN');
    const document = normalizedPdfUrl
      ? await findOrCreateCseDocument(client, identity, {
          documentType: documentTypeForReport(input.reportType),
          title: input.title,
          sourceUrl: normalizedPdfUrl,
          sourceDocumentId: input.sourceDocumentId ?? null,
          financialYear: input.financialYear ?? null,
          period: input.period ?? null,
          publishedDate: input.publishedDate ?? null
        })
      : null;

    const result = await client.query(
      `INSERT INTO cse_company_financial_reports (
         company_id, security_id, symbol, report_type, title, financial_year, period,
         published_date, pdf_url, original_pdf_url, source_url, document_id, source_document_id,
         payload_hash, document_status, document_error, raw_row_json
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb)
       ON CONFLICT (symbol, pdf_url)
       DO UPDATE SET
         report_type = EXCLUDED.report_type,
         title = EXCLUDED.title,
         financial_year = EXCLUDED.financial_year,
         period = EXCLUDED.period,
         published_date = EXCLUDED.published_date,
         original_pdf_url = COALESCE(EXCLUDED.original_pdf_url, cse_company_financial_reports.original_pdf_url),
         source_url = EXCLUDED.source_url,
         document_id = COALESCE(cse_company_financial_reports.document_id, EXCLUDED.document_id),
         source_document_id = COALESCE(EXCLUDED.source_document_id, cse_company_financial_reports.source_document_id),
         payload_hash = EXCLUDED.payload_hash,
         document_status = EXCLUDED.document_status,
         document_error = EXCLUDED.document_error,
         raw_row_json = EXCLUDED.raw_row_json
       RETURNING *`,
      [
        identity.companyId,
        identity.securityId,
        identity.symbol,
        input.reportType,
        input.title,
        input.financialYear ?? null,
        input.period ?? null,
        input.publishedDate ?? null,
        normalizedPdfUrl,
        originalPdfUrl,
        input.sourceUrl ?? null,
        document?.id ?? null,
        input.sourceDocumentId ?? null,
        input.payloadHash ?? null,
        document?.status ?? (normalizedPdfUrl ? 'DISCOVERED' : 'NO_PDF'),
        document?.error_message ?? null,
        compactJson(input.rawRow ?? {})
      ]
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function upsertAnnouncement(identity: CseSecurityIdentity, input: CseAnnouncementInput, range: { startDate?: string | null; endDate?: string | null }) {
  const client = await pool.connect();
  const normalizedPdfUrl = normalizeIncomingPdfUrl(input.pdfUrl);
  const originalPdfUrl = input.originalPdfUrl ?? input.pdfUrl ?? null;
  try {
    await client.query('BEGIN');
    const document = normalizedPdfUrl
      ? await findOrCreateCseDocument(client, identity, {
          documentType: documentTypeForAnnouncement(input.announcementCategory),
          title: input.announcementTitle,
          sourceUrl: normalizedPdfUrl,
          sourceDocumentId: input.sourceAnnouncementId ?? null,
          publishedDate: input.publishedDate ?? null
        })
      : null;

    const result = await client.query(
      `INSERT INTO cse_company_announcements (
         company_id, security_id, symbol, announcement_title, announcement_category,
         published_at, published_date, pdf_url, original_pdf_url, source_url, document_id,
         source_announcement_id, payload_hash, document_status, document_error,
         date_range_start, date_range_end, raw_row_json
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb)
       ON CONFLICT (symbol, pdf_url) WHERE pdf_url IS NOT NULL
       DO UPDATE SET
         announcement_title = EXCLUDED.announcement_title,
         announcement_category = EXCLUDED.announcement_category,
         published_at = EXCLUDED.published_at,
         published_date = EXCLUDED.published_date,
         original_pdf_url = COALESCE(EXCLUDED.original_pdf_url, cse_company_announcements.original_pdf_url),
         source_url = EXCLUDED.source_url,
         document_id = COALESCE(cse_company_announcements.document_id, EXCLUDED.document_id),
         source_announcement_id = COALESCE(EXCLUDED.source_announcement_id, cse_company_announcements.source_announcement_id),
         payload_hash = EXCLUDED.payload_hash,
         document_status = EXCLUDED.document_status,
         document_error = EXCLUDED.document_error,
         date_range_start = EXCLUDED.date_range_start,
         date_range_end = EXCLUDED.date_range_end,
         raw_row_json = EXCLUDED.raw_row_json
       RETURNING *`,
      [
        identity.companyId,
        identity.securityId,
        identity.symbol,
        input.announcementTitle,
        input.announcementCategory ?? null,
        input.publishedAt ?? null,
        input.publishedDate ?? null,
        normalizedPdfUrl,
        originalPdfUrl,
        input.sourceUrl ?? null,
        document?.id ?? null,
        input.sourceAnnouncementId ?? null,
        input.payloadHash ?? null,
        document?.status ?? (normalizedPdfUrl ? 'DISCOVERED' : 'NO_PDF'),
        document?.error_message ?? null,
        range.startDate ?? null,
        range.endDate ?? null,
        compactJson(input.rawRow ?? {})
      ]
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function upsertLatestPrice(identity: CseSecurityIdentity, input: CseLatestPriceInput, options?: { insertSnapshot?: boolean }) {
  const result = await query(
    `INSERT INTO cse_latest_prices (
       company_id, security_id, symbol, last_traded_price, change_amount, change_percent,
       previous_close, open_price, high_price, low_price, turnover, share_volume,
       trade_volume, market_cap, market_status, trade_time, source, raw_payload_hash, raw_payload_json
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb)
     ON CONFLICT (symbol)
     DO UPDATE SET
       company_id = EXCLUDED.company_id,
       security_id = EXCLUDED.security_id,
       last_traded_price = EXCLUDED.last_traded_price,
       change_amount = EXCLUDED.change_amount,
       change_percent = EXCLUDED.change_percent,
       previous_close = EXCLUDED.previous_close,
       open_price = EXCLUDED.open_price,
       high_price = EXCLUDED.high_price,
       low_price = EXCLUDED.low_price,
       turnover = EXCLUDED.turnover,
       share_volume = EXCLUDED.share_volume,
       trade_volume = EXCLUDED.trade_volume,
       market_cap = EXCLUDED.market_cap,
       market_status = EXCLUDED.market_status,
       trade_time = EXCLUDED.trade_time,
       source = EXCLUDED.source,
       raw_payload_hash = EXCLUDED.raw_payload_hash,
       raw_payload_json = EXCLUDED.raw_payload_json
     RETURNING *`,
    [
      identity.companyId,
      identity.securityId,
      identity.symbol,
      input.lastTradedPrice ?? null,
      input.changeAmount ?? null,
      input.changePercent ?? null,
      input.previousClose ?? null,
      input.openPrice ?? null,
      input.highPrice ?? null,
      input.lowPrice ?? null,
      input.turnover ?? null,
      input.shareVolume ?? null,
      input.tradeVolume ?? null,
      input.marketCap ?? null,
      input.marketStatus ?? null,
      input.tradeTime ?? null,
      input.source ?? 'CSE_TODAY_SHARE_PRICE',
      input.rawPayloadHash ?? null,
      compactJson(input.rawPayload ?? {})
    ]
  );

  if (options?.insertSnapshot) {
    await query(
      `INSERT INTO cse_price_snapshots (
         company_id, security_id, symbol, last_traded_price, change_amount, change_percent,
         turnover, share_volume, trade_volume, market_status, snapshot_at, source, raw_payload_hash
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, $12)`,
      [
        identity.companyId,
        identity.securityId,
        identity.symbol,
        input.lastTradedPrice ?? null,
        input.changeAmount ?? null,
        input.changePercent ?? null,
        input.turnover ?? null,
        input.shareVolume ?? null,
        input.tradeVolume ?? null,
        input.marketStatus ?? null,
        input.source ?? 'CSE_TODAY_SHARE_PRICE',
        input.rawPayloadHash ?? null
      ]
    );
  }

  return result.rows[0];
}


export async function refreshFinancialReportAutoDownloadEligibility(symbol: string): Promise<string[]> {
  const normalized = upperSymbol(symbol);
  await query(
    `UPDATE cse_company_financial_reports
        SET auto_download_eligible = false,
            auto_download_reason = CASE WHEN pdf_url IS NULL THEN 'NO_VALID_PDF_URL' ELSE 'OLDER_METADATA_ONLY' END
      WHERE symbol = $1`,
    [normalized]
  );

  await query(
    `WITH ranked AS (
       SELECT id,
              CASE
                WHEN report_type = 'ANNUAL_REPORT' THEN 'LATEST_ANNUAL_REPORT'
                WHEN report_type IN ('INTERIM_REPORT', 'QUARTERLY_REPORT') THEN 'LATEST_4_INTERIM_REPORTS'
                ELSE NULL
              END AS reason,
              ROW_NUMBER() OVER (
                PARTITION BY CASE
                  WHEN report_type = 'ANNUAL_REPORT' THEN 'ANNUAL'
                  WHEN report_type IN ('INTERIM_REPORT', 'QUARTERLY_REPORT') THEN 'INTERIM'
                  ELSE 'OTHER'
                END
                ORDER BY published_date DESC NULLS LAST,
                         financial_year DESC NULLS LAST,
                         period DESC NULLS LAST,
                         created_at DESC
              ) AS rn
         FROM cse_company_financial_reports
        WHERE symbol = $1
          AND pdf_url IS NOT NULL
          AND report_type IN ('ANNUAL_REPORT', 'INTERIM_REPORT', 'QUARTERLY_REPORT')
     )
     UPDATE cse_company_financial_reports fr
        SET auto_download_eligible = true,
            auto_download_reason = ranked.reason
       FROM ranked
      WHERE fr.id = ranked.id
        AND ((ranked.reason = 'LATEST_ANNUAL_REPORT' AND ranked.rn <= 1)
          OR (ranked.reason = 'LATEST_4_INTERIM_REPORTS' AND ranked.rn <= 4))`,
    [normalized]
  );

  await query(
    `UPDATE cse_company_financial_reports fr
        SET document_status = d.status::text,
            document_error = d.error_message
       FROM documents d
      WHERE fr.document_id = d.id
        AND fr.symbol = $1`,
    [normalized]
  );

  const eligible = await query(
    `SELECT DISTINCT fr.document_id
       FROM cse_company_financial_reports fr
       JOIN documents d ON d.id = fr.document_id
      WHERE fr.symbol = $1
        AND fr.auto_download_eligible = true
        AND fr.document_id IS NOT NULL
        AND d.status IN ('DISCOVERED'::document_status, 'FAILED'::document_status)`,
    [normalized]
  );
  return eligible.rows.map((row) => String(row.document_id));
}

const IMPORTANT_ANNOUNCEMENT_PATTERN = 'financial statement|interim financial statement|annual report|dividend|rights issue|share split|subdivision|capitalization|director|board|material disclosure|circular|corporate disclosure|takeover|merger|amalgamation|related party transaction';

export async function refreshAnnouncementAutoDownloadEligibility(symbol: string): Promise<string[]> {
  const normalized = upperSymbol(symbol);
  await query(
    `UPDATE cse_company_announcements
        SET auto_download_eligible = false,
            auto_download_reason = CASE
              WHEN pdf_url IS NULL THEN 'NO_VALID_PDF_URL'
              WHEN published_date IS NULL THEN 'UNKNOWN_DATE_METADATA_ONLY'
              WHEN published_date < CURRENT_DATE - INTERVAL '90 days' THEN 'OLD_ANNOUNCEMENT_METADATA_ONLY'
              ELSE 'NON_IMPORTANT_ANNOUNCEMENT_METADATA_ONLY'
            END
      WHERE symbol = $1`,
    [normalized]
  );

  await query(
    `UPDATE cse_company_announcements
        SET auto_download_eligible = true,
            auto_download_reason = 'IMPORTANT_RECENT_ANNOUNCEMENT'
      WHERE symbol = $1
        AND pdf_url IS NOT NULL
        AND published_date IS NOT NULL
        AND published_date >= CURRENT_DATE - INTERVAL '90 days'
        AND CONCAT_WS(' ', announcement_title, announcement_category) ~* $2`,
    [normalized, IMPORTANT_ANNOUNCEMENT_PATTERN]
  );

  await query(
    `UPDATE cse_company_announcements an
        SET document_status = d.status::text,
            document_error = d.error_message
       FROM documents d
      WHERE an.document_id = d.id
        AND an.symbol = $1`,
    [normalized]
  );

  const eligible = await query(
    `SELECT DISTINCT an.document_id
       FROM cse_company_announcements an
       JOIN documents d ON d.id = an.document_id
      WHERE an.symbol = $1
        AND an.auto_download_eligible = true
        AND an.document_id IS NOT NULL
        AND d.status IN ('DISCOVERED'::document_status, 'FAILED'::document_status)`,
    [normalized]
  );
  return eligible.rows.map((row) => String(row.document_id));
}

export async function updateLinkedCseDocumentStatus(documentId: string, status: string, errorMessage?: string | null) {
  await query(
    `UPDATE cse_company_financial_reports
        SET document_status = $2,
            document_error = $3,
            download_status = CASE WHEN $2 = 'FAILED' THEN 'FAILED' WHEN $2 IN ('STORED', 'EXTRACTING', 'EXTRACTED', 'EMBEDDED') THEN 'DOWNLOADED' ELSE download_status END
      WHERE document_id = $1`,
    [documentId, status, errorMessage ?? null]
  );
  await query(
    `UPDATE cse_company_announcements
        SET document_status = $2,
            document_error = $3
      WHERE document_id = $1`,
    [documentId, status, errorMessage ?? null]
  );
}

export async function upsertSymbolImportResult(input: {
  runId: string;
  symbol: string;
  importType: CseCompanyImportType;
  status: string;
  recordsFound?: number;
  documentsDiscovered?: number;
  announcementsDiscovered?: number;
  errorMessage?: string | null;
  warnings?: string[];
}) {
  const result = await query(
    `INSERT INTO cse_company_import_symbol_results (
       run_id, symbol, import_type, status, records_found, documents_discovered,
       announcements_discovered, error_message, warnings_json, finished_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW())
     ON CONFLICT (run_id, symbol, import_type)
     DO UPDATE SET
       status = EXCLUDED.status,
       records_found = EXCLUDED.records_found,
       documents_discovered = EXCLUDED.documents_discovered,
       announcements_discovered = EXCLUDED.announcements_discovered,
       error_message = EXCLUDED.error_message,
       warnings_json = EXCLUDED.warnings_json,
       finished_at = NOW()
     RETURNING *`,
    [
      input.runId,
      upperSymbol(input.symbol),
      input.importType,
      input.status,
      input.recordsFound ?? 0,
      input.documentsDiscovered ?? 0,
      input.announcementsDiscovered ?? 0,
      input.errorMessage ?? null,
      JSON.stringify(input.warnings ?? [])
    ]
  );
  return result.rows[0];
}

export async function listCompanyProfiles(params: { limit?: number; search?: string }) {
  const values: unknown[] = [];
  const conditions: string[] = [];
  if (params.search?.trim()) {
    values.push(`%${params.search.trim()}%`);
    conditions.push(`(p.symbol ILIKE $${values.length} OR p.company_name ILIKE $${values.length})`);
  }
  const limit = params.limit && params.limit > 0 ? params.limit : 100;
  values.push(limit);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(
    `SELECT p.*,
            lp.last_traded_price,
            lp.change_amount,
            lp.change_percent,
            lp.updated_at AS latest_price_updated_at,
            COALESCE(fr.report_count, 0) AS report_count,
            COALESCE(an.announcement_count, 0) AS announcement_count
       FROM cse_company_profiles p
       LEFT JOIN cse_latest_prices lp ON lp.symbol = p.symbol
       LEFT JOIN (SELECT symbol, COUNT(*) AS report_count FROM cse_company_financial_reports GROUP BY symbol) fr ON fr.symbol = p.symbol
       LEFT JOIN (SELECT symbol, COUNT(*) AS announcement_count FROM cse_company_announcements GROUP BY symbol) an ON an.symbol = p.symbol
       ${where}
       ORDER BY p.symbol ASC
       LIMIT $${values.length}`,
    values
  );
  return result.rows;
}

export async function getCompanyIntelligence(symbol: string) {
  const normalized = upperSymbol(symbol);
  const profile = await query(`SELECT * FROM cse_company_profiles WHERE symbol = $1 LIMIT 1`, [normalized]);
  const people = await query(`SELECT * FROM cse_company_people WHERE symbol = $1 AND is_current = true ORDER BY role_group, person_name`, [normalized]);
  const financialReports = await listFinancialReportsBySymbol(normalized);
  const announcements = await listAnnouncementsBySymbol(normalized, {});
  const latestPrice = await getLatestPriceBySymbol(normalized);
  return {
    profile: profile.rows[0] ?? null,
    people: people.rows,
    financialReports,
    announcements,
    latestPrice
  };
}


export async function listFinancialReports(params: { symbol?: string; reportType?: string; financialYear?: string; documentStatus?: string; limit?: number; search?: string }) {
  const values: unknown[] = [];
  const conditions: string[] = [];
  if (params.symbol?.trim()) {
    values.push(upperSymbol(params.symbol));
    conditions.push(`fr.symbol = $${values.length}`);
  }
  if (params.reportType?.trim()) {
    values.push(params.reportType.trim().toUpperCase());
    conditions.push(`fr.report_type = $${values.length}`);
  }
  if (params.financialYear?.trim()) {
    values.push(params.financialYear.trim());
    conditions.push(`fr.financial_year = $${values.length}`);
  }
  if (params.documentStatus?.trim()) {
    values.push(params.documentStatus.trim().toUpperCase());
    conditions.push(`COALESCE(d.status::text, 'MISSING') = $${values.length}`);
  }
  if (params.search?.trim()) {
    values.push(`%${params.search.trim()}%`);
    conditions.push(`(fr.symbol ILIKE $${values.length} OR fr.title ILIKE $${values.length} OR c.name ILIKE $${values.length})`);
  }
  const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 1000) : 300;
  values.push(limit);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(
    `SELECT fr.*, c.name AS company_name, d.status AS document_status, d.error_message AS document_error
       FROM cse_company_financial_reports fr
       LEFT JOIN cse_companies c ON c.id = fr.company_id
       LEFT JOIN documents d ON d.id = fr.document_id
       ${where}
       ORDER BY fr.published_date DESC NULLS LAST, fr.created_at DESC
       LIMIT $${values.length}`,
    values
  );
  return result.rows;
}

export async function listFinancialReportsBySymbol(symbol: string) {
  const result = await query(`SELECT * FROM cse_company_financial_reports WHERE symbol = $1 ORDER BY published_date DESC NULLS LAST, created_at DESC`, [upperSymbol(symbol)]);
  return result.rows;
}


export async function listAnnouncements(params: { symbol?: string; startDate?: string; endDate?: string; category?: string; documentStatus?: string; limit?: number; search?: string }) {
  const values: unknown[] = [];
  const conditions: string[] = [];
  if (params.symbol?.trim()) {
    values.push(upperSymbol(params.symbol));
    conditions.push(`an.symbol = $${values.length}`);
  }
  if (params.startDate) {
    values.push(params.startDate);
    conditions.push(`an.published_date >= $${values.length}::date`);
  }
  if (params.endDate) {
    values.push(params.endDate);
    conditions.push(`an.published_date <= $${values.length}::date`);
  }
  if (params.category?.trim()) {
    values.push(`%${params.category.trim()}%`);
    conditions.push(`an.announcement_category ILIKE $${values.length}`);
  }
  if (params.documentStatus?.trim()) {
    values.push(params.documentStatus.trim().toUpperCase());
    conditions.push(`COALESCE(d.status::text, 'MISSING') = $${values.length}`);
  }
  if (params.search?.trim()) {
    values.push(`%${params.search.trim()}%`);
    conditions.push(`(an.symbol ILIKE $${values.length} OR an.announcement_title ILIKE $${values.length} OR c.name ILIKE $${values.length})`);
  }
  const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 1000) : 300;
  values.push(limit);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(
    `SELECT an.*, c.name AS company_name, d.status AS document_status, d.error_message AS document_error
       FROM cse_company_announcements an
       LEFT JOIN cse_companies c ON c.id = an.company_id
       LEFT JOIN documents d ON d.id = an.document_id
       ${where}
       ORDER BY an.published_date DESC NULLS LAST, an.published_at DESC NULLS LAST, an.created_at DESC
       LIMIT $${values.length}`,
    values
  );
  return result.rows;
}

export async function listAnnouncementsBySymbol(symbol: string, params: { startDate?: string; endDate?: string }) {
  const values: unknown[] = [upperSymbol(symbol)];
  const conditions = ['symbol = $1'];
  if (params.startDate) {
    values.push(params.startDate);
    conditions.push(`published_date >= $${values.length}::date`);
  }
  if (params.endDate) {
    values.push(params.endDate);
    conditions.push(`published_date <= $${values.length}::date`);
  }
  const result = await query(
    `SELECT * FROM cse_company_announcements
      WHERE ${conditions.join(' AND ')}
      ORDER BY published_date DESC NULLS LAST, published_at DESC NULLS LAST, created_at DESC
      LIMIT 500`,
    values
  );
  return result.rows;
}

export async function getLatestPriceBySymbol(symbol: string) {
  const result = await query(`SELECT * FROM cse_latest_prices WHERE symbol = $1 LIMIT 1`, [upperSymbol(symbol)]);
  return result.rows[0] ?? null;
}

export async function listLatestPrices(params: { limit?: number; search?: string }) {
  const values: unknown[] = [];
  const conditions: string[] = [];
  if (params.search?.trim()) {
    values.push(`%${params.search.trim()}%`);
    conditions.push(`(lp.symbol ILIKE $${values.length} OR c.name ILIKE $${values.length})`);
  }
  const limit = params.limit && params.limit > 0 ? params.limit : 200;
  values.push(limit);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(
    `SELECT lp.*, c.name AS company_name
       FROM cse_latest_prices lp
       LEFT JOIN cse_companies c ON c.id = lp.company_id
       ${where}
       ORDER BY lp.updated_at DESC
       LIMIT $${values.length}`,
    values
  );
  return result.rows;
}


export async function listImportRunSymbolResults(
  runId: string,
  params: { status?: string; importType?: CseCompanyImportType; symbol?: string; limit?: number; offset?: number }
) {
  const values: unknown[] = [runId];
  const conditions = ['run_id = $1'];
  if (params.status?.trim()) {
    values.push(params.status.trim().toUpperCase());
    conditions.push(`status = $${values.length}`);
  }
  if (params.importType?.trim()) {
    values.push(params.importType.trim().toUpperCase());
    conditions.push(`import_type = $${values.length}`);
  }
  if (params.symbol?.trim()) {
    values.push(upperSymbol(params.symbol));
    conditions.push(`symbol = $${values.length}`);
  }
  const countResult = await query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'SUCCESS')::int AS success,
       COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
       COUNT(*) FILTER (WHERE status IN ('WARNING', 'PARTIAL_SUCCESS'))::int AS warning,
       COUNT(*) FILTER (WHERE status = 'SKIPPED')::int AS skipped
     FROM cse_company_import_symbol_results
     WHERE ${conditions.join(' AND ')}`,
    values
  );
  const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 500) : 100;
  const offset = params.offset && params.offset > 0 ? params.offset : 0;
  values.push(limit, offset);
  const itemsResult = await query(
    `SELECT *
       FROM cse_company_import_symbol_results
      WHERE ${conditions.join(' AND ')}
      ORDER BY finished_at DESC NULLS LAST, symbol ASC
      LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  const summary = countResult.rows[0] ?? { total: 0, success: 0, failed: 0, warning: 0, skipped: 0 };
  return { runId, summary, items: itemsResult.rows };
}

export async function listFailedSymbolsForRun(runId: string, importType: CseCompanyImportType, limit?: number): Promise<string[]> {
  const values: unknown[] = [runId, importType];
  const limitSql = limit && limit > 0 ? `LIMIT $${values.push(Math.min(limit, 500))}` : '';
  const result = await query(
    `SELECT DISTINCT symbol
       FROM cse_company_import_symbol_results
      WHERE run_id = $1
        AND import_type = $2
        AND status = 'FAILED'
      ORDER BY symbol ASC
      ${limitSql}`,
    values
  );
  return result.rows.map((row) => String(row.symbol));
}

export async function setFetchRunParentRunId(runId: string, parentRunId: string) {
  await query(`UPDATE cse_fetch_runs SET parent_run_id = $2 WHERE id = $1`, [runId, parentRunId]);
}

export async function insertMarketStatusSnapshot(input: { status?: string | null; isOpen?: boolean | null; source?: string | null; rawPayload?: Record<string, unknown> }) {
  const result = await query(
    `INSERT INTO cse_market_status_snapshots (status, is_open, source, raw_payload_json, checked_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW())
     RETURNING *`,
    [input.status ?? null, input.isOpen ?? null, input.source ?? 'CSE_MARKET_STATUS_API', compactJson(input.rawPayload ?? {})]
  );
  return result.rows[0];
}

export async function latestMarketStatusSnapshot() {
  const result = await query(`SELECT * FROM cse_market_status_snapshots ORDER BY checked_at DESC LIMIT 1`);
  return result.rows[0] ?? null;
}

export async function retryFinancialReportDocument(id: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rowResult = await client.query(
      `SELECT fr.*, c.name AS company_name
         FROM cse_company_financial_reports fr
         LEFT JOIN cse_companies c ON c.id = fr.company_id
        WHERE fr.id = $1
        LIMIT 1`,
      [id]
    );
    const report = rowResult.rows[0];
    if (!report) throw new Error('CSE financial report not found.');
    const normalizedPdfUrl = retryPdfSourceFromRow(report, 'CSE financial report');
    const identity: CseSecurityIdentity = {
      companyId: report.company_id,
      securityId: report.security_id,
      symbol: report.symbol,
      companyName: report.company_name ?? report.symbol
    };
    const document = await findOrCreateCseDocument(client, identity, {
      documentType: documentTypeForReport(report.report_type),
      title: report.title,
      sourceUrl: normalizedPdfUrl,
      sourceDocumentId: report.source_document_id,
      financialYear: report.financial_year,
      period: report.period,
      publishedDate: report.published_date
    });
    await client.query(
      `UPDATE cse_company_financial_reports
          SET pdf_url = $2,
              document_id = $3,
              document_status = $4,
              document_error = NULL,
              original_pdf_url = COALESCE(original_pdf_url, $5)
        WHERE id = $1`,
      [id, normalizedPdfUrl, document.id, document.status, report.original_pdf_url ?? report.pdf_url ?? null]
    );
    await client.query('COMMIT');
    return { reportId: id, documentId: document.id, pdfUrl: normalizedPdfUrl, status: document.status };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function retryAnnouncementDocument(id: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rowResult = await client.query(
      `SELECT an.*, c.name AS company_name
         FROM cse_company_announcements an
         LEFT JOIN cse_companies c ON c.id = an.company_id
        WHERE an.id = $1
        LIMIT 1`,
      [id]
    );
    const announcement = rowResult.rows[0];
    if (!announcement) throw new Error('CSE announcement not found.');
    const normalizedPdfUrl = retryPdfSourceFromRow(announcement, 'CSE announcement');
    const identity: CseSecurityIdentity = {
      companyId: announcement.company_id,
      securityId: announcement.security_id,
      symbol: announcement.symbol,
      companyName: announcement.company_name ?? announcement.symbol
    };
    const document = await findOrCreateCseDocument(client, identity, {
      documentType: documentTypeForAnnouncement(announcement.announcement_category),
      title: announcement.announcement_title,
      sourceUrl: normalizedPdfUrl,
      sourceDocumentId: announcement.source_announcement_id,
      publishedDate: announcement.published_date
    });
    await client.query(
      `UPDATE cse_company_announcements
          SET pdf_url = $2,
              document_id = $3,
              document_status = $4,
              document_error = NULL,
              original_pdf_url = COALESCE(original_pdf_url, $5)
        WHERE id = $1`,
      [id, normalizedPdfUrl, document.id, document.status, announcement.original_pdf_url ?? announcement.pdf_url ?? null]
    );
    await client.query('COMMIT');
    return { announcementId: id, documentId: document.id, pdfUrl: normalizedPdfUrl, status: document.status };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
