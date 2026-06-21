CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
  CREATE TYPE document_type AS ENUM ('ANNUAL_REPORT', 'INTERIM_REPORT', 'ANNOUNCEMENT', 'CIRCULAR', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE document_status AS ENUM (
    'DISCOVERED',
    'DOWNLOADING',
    'DOWNLOADED',
    'STORED',
    'EXTRACTING',
    'EXTRACTED',
    'CHUNKING',
    'CHUNKED',
    'EMBEDDING',
    'EMBEDDED',
    'ANALYZING',
    'ANALYZED',
    'DUPLICATE',
    'FAILED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;


DO $$ BEGIN
  ALTER TYPE document_status ADD VALUE IF NOT EXISTS 'DUPLICATE';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE processing_job_type AS ENUM ('DOCUMENT_DOWNLOAD', 'PDF_EXTRACT', 'DOCUMENT_CHUNK', 'EMBEDDING', 'AI_SUMMARY');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE processing_job_status AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'FAILED', 'RETRYING', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE log_level AS ENUM ('INFO', 'WARN', 'ERROR', 'DEBUG');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol VARCHAR(20) NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sector TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  symbol VARCHAR(20) NOT NULL,
  document_type document_type NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT,
  source_document_id TEXT,
  financial_year VARCHAR(20),
  period VARCHAR(50),
  published_date DATE,
  file_name TEXT,
  mime_type TEXT,
  file_size BIGINT,
  checksum TEXT,
  minio_bucket TEXT,
  minio_object_key TEXT,
  status document_status NOT NULL DEFAULT 'DISCOVERED',
  error_message TEXT,
  is_duplicate BOOLEAN NOT NULL DEFAULT false,
  duplicate_of_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  duplicate_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT documents_source_url_unique UNIQUE (source_url),
  CONSTRAINT documents_checksum_unique UNIQUE (checksum)
);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS duplicate_of_document_id UUID REFERENCES documents(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS duplicate_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_documents_symbol ON documents(symbol);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_company_id ON documents(company_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_duplicate_of ON documents(duplicate_of_document_id);
CREATE UNIQUE INDEX IF NOT EXISTS documents_business_unique_idx
  ON documents (company_id, document_type, COALESCE(financial_year, ''), COALESCE(period, ''))
  WHERE is_duplicate = false
    AND status <> 'DUPLICATE'::document_status
    AND document_type IN ('ANNUAL_REPORT'::document_type, 'INTERIM_REPORT'::document_type);

CREATE TABLE IF NOT EXISTS document_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  char_count INTEGER NOT NULL DEFAULT 0,
  word_count INTEGER NOT NULL DEFAULT 0,
  extraction_method TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_pages_document_page_unique UNIQUE (document_id, page_number)
);

CREATE INDEX IF NOT EXISTS idx_document_pages_document_id ON document_pages(document_id);

CREATE TABLE IF NOT EXISTS processing_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  queue_name TEXT NOT NULL,
  bullmq_job_id TEXT,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  job_type processing_job_type NOT NULL,
  status processing_job_status NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processing_jobs_document_id ON processing_jobs(document_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_bullmq_job_id ON processing_jobs(bullmq_job_id);

CREATE TABLE IF NOT EXISTS processing_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  job_id UUID REFERENCES processing_jobs(id) ON DELETE SET NULL,
  level log_level NOT NULL DEFAULT 'INFO',
  message TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processing_logs_document_id ON processing_logs(document_id);
CREATE INDEX IF NOT EXISTS idx_processing_logs_job_id ON processing_logs(job_id);

CREATE TABLE IF NOT EXISTS ai_report_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  summary_type TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_name TEXT,
  token_input INTEGER,
  token_output INTEGER,
  cost_estimate NUMERIC(12, 6),
  source_references_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_report_summary_unique UNIQUE (document_id, summary_type, language)
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS companies_set_updated_at ON companies;
CREATE TRIGGER companies_set_updated_at
BEFORE UPDATE ON companies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS documents_set_updated_at ON documents;
CREATE TRIGGER documents_set_updated_at
BEFORE UPDATE ON documents
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS document_pages_set_updated_at ON document_pages;
CREATE TRIGGER document_pages_set_updated_at
BEFORE UPDATE ON document_pages
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS processing_jobs_set_updated_at ON processing_jobs;
CREATE TRIGGER processing_jobs_set_updated_at
BEFORE UPDATE ON processing_jobs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS ai_report_summaries_set_updated_at ON ai_report_summaries;
CREATE TRIGGER ai_report_summaries_set_updated_at
BEFORE UPDATE ON ai_report_summaries
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- -----------------------------------------------------------------------------
-- CSE ALPHABETICAL listed-company importer + daily trading snapshots
-- Source rule: only listed-company-directory?page=ALPHABETICAL is allowed.
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE cse_fetch_run_status AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TYPE cse_fetch_run_status ADD VALUE IF NOT EXISTS 'RUNNING';

CREATE TABLE IF NOT EXISTS cse_companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  profile_url TEXT,
  logo_url TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_import_run_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cse_securities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES cse_companies(id) ON DELETE CASCADE,
  symbol VARCHAR(30) NOT NULL UNIQUE,
  normalized_symbol VARCHAR(30) NOT NULL UNIQUE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_import_run_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cse_daily_market_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  security_id UUID NOT NULL REFERENCES cse_securities(id) ON DELETE CASCADE,
  symbol VARCHAR(30) NOT NULL,
  trading_date DATE NOT NULL,
  last_traded_price NUMERIC(18, 4),
  previous_close NUMERIC(18, 4),
  open_price NUMERIC(18, 4),
  high_price NUMERIC(18, 4),
  low_price NUMERIC(18, 4),
  trade_volume BIGINT,
  share_volume BIGINT,
  turnover NUMERIC(20, 4),
  change_amount NUMERIC(18, 4),
  change_percent NUMERIC(12, 6),
  is_watch_list BOOLEAN NOT NULL DEFAULT false,
  market_timestamp TIMESTAMPTZ,
  source_market_timestamp_text TEXT,
  import_run_id UUID,
  source_page TEXT NOT NULL DEFAULT 'ALPHABETICAL',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_row JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cse_daily_market_symbol_date_unique UNIQUE (symbol, trading_date)
);

CREATE TABLE IF NOT EXISTS cse_fetch_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source TEXT NOT NULL DEFAULT 'CSE_ALPHABETICAL',
  source_url TEXT NOT NULL,
  fetch_mode TEXT NOT NULL,
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  status cse_fetch_run_status NOT NULL DEFAULT 'FAILED',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  records_found INTEGER NOT NULL DEFAULT 0,
  companies_created INTEGER NOT NULL DEFAULT 0,
  companies_updated INTEGER NOT NULL DEFAULT 0,
  securities_created INTEGER NOT NULL DEFAULT 0,
  securities_updated INTEGER NOT NULL DEFAULT 0,
  snapshots_created INTEGER NOT NULL DEFAULT 0,
  snapshots_updated INTEGER NOT NULL DEFAULT 0,
  records_failed INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_file_path TEXT,
  letters_attempted INTEGER,
  letters_successful INTEGER,
  letters_failed INTEGER,
  records_before_deduplication INTEGER,
  records_deduplicated INTEGER,
  validation_report JSONB,
  promoted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cse_fetch_runs ADD COLUMN IF NOT EXISTS letters_attempted INTEGER;
ALTER TABLE cse_fetch_runs ADD COLUMN IF NOT EXISTS letters_successful INTEGER;
ALTER TABLE cse_fetch_runs ADD COLUMN IF NOT EXISTS letters_failed INTEGER;
ALTER TABLE cse_fetch_runs ADD COLUMN IF NOT EXISTS records_before_deduplication INTEGER;
ALTER TABLE cse_fetch_runs ADD COLUMN IF NOT EXISTS records_deduplicated INTEGER;
ALTER TABLE cse_fetch_runs ADD COLUMN IF NOT EXISTS trigger_type TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE cse_fetch_runs ADD COLUMN IF NOT EXISTS validation_report JSONB;
ALTER TABLE cse_fetch_runs ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ;
ALTER TABLE cse_companies ADD COLUMN IF NOT EXISTS last_seen_import_run_id UUID;
ALTER TABLE cse_securities ADD COLUMN IF NOT EXISTS last_seen_import_run_id UUID;
ALTER TABLE cse_daily_market_snapshots ADD COLUMN IF NOT EXISTS import_run_id UUID;
ALTER TABLE cse_daily_market_snapshots ADD COLUMN IF NOT EXISTS previous_close NUMERIC(18, 4);
ALTER TABLE cse_daily_market_snapshots ADD COLUMN IF NOT EXISTS open_price NUMERIC(18, 4);
ALTER TABLE cse_daily_market_snapshots ADD COLUMN IF NOT EXISTS high_price NUMERIC(18, 4);
ALTER TABLE cse_daily_market_snapshots ADD COLUMN IF NOT EXISTS low_price NUMERIC(18, 4);
ALTER TABLE cse_daily_market_snapshots ADD COLUMN IF NOT EXISTS is_watch_list BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE cse_daily_market_snapshots ADD COLUMN IF NOT EXISTS market_timestamp TIMESTAMPTZ;
ALTER TABLE cse_daily_market_snapshots ADD COLUMN IF NOT EXISTS source_market_timestamp_text TEXT;

CREATE INDEX IF NOT EXISTS idx_cse_companies_last_seen ON cse_companies(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_cse_companies_active ON cse_companies(is_active);
CREATE INDEX IF NOT EXISTS idx_cse_securities_company_id ON cse_securities(company_id);
CREATE INDEX IF NOT EXISTS idx_cse_securities_last_seen ON cse_securities(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_cse_daily_market_date ON cse_daily_market_snapshots(trading_date DESC);
CREATE INDEX IF NOT EXISTS idx_cse_daily_market_symbol ON cse_daily_market_snapshots(symbol);
CREATE INDEX IF NOT EXISTS idx_cse_daily_market_change_percent ON cse_daily_market_snapshots(change_percent);
CREATE INDEX IF NOT EXISTS idx_cse_daily_market_turnover ON cse_daily_market_snapshots(turnover);
CREATE INDEX IF NOT EXISTS idx_cse_daily_market_trade_volume ON cse_daily_market_snapshots(trade_volume);
CREATE INDEX IF NOT EXISTS idx_cse_daily_market_share_volume ON cse_daily_market_snapshots(share_volume);
CREATE INDEX IF NOT EXISTS idx_cse_daily_market_watch_list ON cse_daily_market_snapshots(is_watch_list);
CREATE INDEX IF NOT EXISTS idx_cse_daily_market_source_page ON cse_daily_market_snapshots(source_page);
CREATE INDEX IF NOT EXISTS idx_cse_daily_market_market_timestamp ON cse_daily_market_snapshots(market_timestamp);
CREATE INDEX IF NOT EXISTS idx_cse_fetch_runs_started_at ON cse_fetch_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS cse_import_artifacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_run_id UUID NOT NULL REFERENCES cse_fetch_runs(id) ON DELETE CASCADE,
  letter CHAR(1),
  artifact_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  checksum TEXT,
  row_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cse_import_artifacts_run_id ON cse_import_artifacts(import_run_id);
CREATE INDEX IF NOT EXISTS idx_cse_import_artifacts_letter ON cse_import_artifacts(letter);


CREATE TABLE IF NOT EXISTS cse_import_stage_companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_run_id UUID NOT NULL REFERENCES cse_fetch_runs(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  profile_url TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cse_stage_company_run_name_unique UNIQUE (import_run_id, normalized_name)
);

CREATE TABLE IF NOT EXISTS cse_import_stage_securities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_run_id UUID NOT NULL REFERENCES cse_fetch_runs(id) ON DELETE CASCADE,
  normalized_name TEXT NOT NULL,
  symbol VARCHAR(30) NOT NULL,
  normalized_symbol VARCHAR(30) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cse_stage_security_run_symbol_unique UNIQUE (import_run_id, normalized_symbol)
);

CREATE TABLE IF NOT EXISTS cse_import_stage_market_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_run_id UUID NOT NULL REFERENCES cse_fetch_runs(id) ON DELETE CASCADE,
  normalized_symbol VARCHAR(30) NOT NULL,
  symbol VARCHAR(30) NOT NULL,
  trading_date DATE NOT NULL,
  last_traded_price NUMERIC(18, 4),
  previous_close NUMERIC(18, 4),
  open_price NUMERIC(18, 4),
  high_price NUMERIC(18, 4),
  low_price NUMERIC(18, 4),
  trade_volume BIGINT,
  share_volume BIGINT,
  turnover NUMERIC(20, 4),
  change_amount NUMERIC(18, 4),
  change_percent NUMERIC(12, 6),
  is_watch_list BOOLEAN NOT NULL DEFAULT false,
  market_timestamp TIMESTAMPTZ,
  source_market_timestamp_text TEXT,
  source_letter CHAR(1),
  raw_row JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cse_stage_snapshot_run_symbol_date_unique UNIQUE (import_run_id, normalized_symbol, trading_date)
);

CREATE INDEX IF NOT EXISTS idx_cse_stage_companies_run_id ON cse_import_stage_companies(import_run_id);
CREATE INDEX IF NOT EXISTS idx_cse_stage_securities_run_id ON cse_import_stage_securities(import_run_id);
CREATE INDEX IF NOT EXISTS idx_cse_stage_snapshots_run_id ON cse_import_stage_market_snapshots(import_run_id);


DROP TRIGGER IF EXISTS cse_companies_set_updated_at ON cse_companies;
CREATE TRIGGER cse_companies_set_updated_at
BEFORE UPDATE ON cse_companies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS cse_securities_set_updated_at ON cse_securities;
CREATE TRIGGER cse_securities_set_updated_at
BEFORE UPDATE ON cse_securities
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS cse_daily_market_snapshots_set_updated_at ON cse_daily_market_snapshots;
CREATE TRIGGER cse_daily_market_snapshots_set_updated_at
BEFORE UPDATE ON cse_daily_market_snapshots
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- -----------------------------------------------------------------------------
-- CSE Daily Market Summary importer: market-level daily overview from
-- /equity/daily-market-summary. Kept separate from company/security snapshots.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cse_daily_market_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trading_date DATE NOT NULL,
  source_url TEXT NOT NULL,
  source_as_of_text TEXT,
  fetch_mode TEXT NOT NULL DEFAULT 'python-http',
  fetch_strategy TEXT NOT NULL DEFAULT 'api-first-html-fallback',
  checksum TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_report JSONB NOT NULL DEFAULT '{}'::jsonb,
  warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  import_run_id UUID REFERENCES cse_fetch_runs(id) ON DELETE SET NULL,

  aspi_today NUMERIC(18, 4),
  aspi_previous NUMERIC(18, 4),
  sp_sl20_today NUMERIC(18, 4),
  sp_sl20_previous NUMERIC(18, 4),
  astri_today NUMERIC(18, 4),
  astri_previous NUMERIC(18, 4),
  tri_sp_sl20_today NUMERIC(18, 4),
  tri_sp_sl20_previous NUMERIC(18, 4),

  equity_turnover_today NUMERIC(24, 4),
  equity_turnover_previous NUMERIC(24, 4),
  domestic_purchases_today NUMERIC(24, 4),
  domestic_purchases_previous NUMERIC(24, 4),
  domestic_sales_today NUMERIC(24, 4),
  domestic_sales_previous NUMERIC(24, 4),
  foreign_purchases_today NUMERIC(24, 4),
  foreign_purchases_previous NUMERIC(24, 4),
  foreign_sales_today NUMERIC(24, 4),
  foreign_sales_previous NUMERIC(24, 4),

  turnover_volume_today BIGINT,
  turnover_volume_previous BIGINT,
  turnover_volume_domestic_today BIGINT,
  turnover_volume_domestic_previous BIGINT,
  turnover_volume_foreign_today BIGINT,
  turnover_volume_foreign_previous BIGINT,

  trades_today BIGINT,
  trades_previous BIGINT,
  trades_domestic_today BIGINT,
  trades_domestic_previous BIGINT,
  trades_foreign_today BIGINT,
  trades_foreign_previous BIGINT,

  corporate_debt_today NUMERIC(24, 4),
  corporate_debt_previous NUMERIC(24, 4),
  government_debt_today NUMERIC(24, 4),
  government_debt_previous NUMERIC(24, 4),

  listed_companies_today INTEGER,
  listed_companies_previous INTEGER,
  traded_companies_today INTEGER,
  traded_companies_previous INTEGER,
  market_per_today NUMERIC(12, 6),
  market_per_previous NUMERIC(12, 6),
  market_pbv_today NUMERIC(12, 6),
  market_pbv_previous NUMERIC(12, 6),
  market_dy_today NUMERIC(12, 6),
  market_dy_previous NUMERIC(12, 6),
  market_cap_today NUMERIC(24, 4),
  market_cap_previous NUMERIC(24, 4),

  cds_total_quantity BIGINT,
  cds_total_market_value NUMERIC(24, 4),
  cds_domestic_quantity BIGINT,
  cds_domestic_market_value NUMERIC(24, 4),
  cds_foreign_quantity BIGINT,
  cds_foreign_market_value NUMERIC(24, 4),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cse_daily_market_summaries_trading_date_unique UNIQUE (trading_date)
);

CREATE INDEX IF NOT EXISTS idx_cse_daily_market_summaries_trading_date ON cse_daily_market_summaries(trading_date DESC);
CREATE INDEX IF NOT EXISTS idx_cse_daily_market_summaries_import_run_id ON cse_daily_market_summaries(import_run_id);

DROP TRIGGER IF EXISTS cse_daily_market_summaries_set_updated_at ON cse_daily_market_summaries;
CREATE TRIGGER cse_daily_market_summaries_set_updated_at
BEFORE UPDATE ON cse_daily_market_summaries
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- CSE GICS importer: official industry groups, group summary, indices, and
-- security-to-industry classification enrichment. Kept separate from A-Z master
-- and Trade Summary daily snapshots.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cse_gics_industry_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  industry_group_code VARCHAR(30) NOT NULL UNIQUE,
  gics_code VARCHAR(20) NOT NULL UNIQUE,
  symbol VARCHAR(20) NOT NULL UNIQUE,
  industry_group_name TEXT NOT NULL,
  source_url TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  raw_row JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cse_gics_group_daily_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  industry_group_id UUID REFERENCES cse_gics_industry_groups(id) ON DELETE SET NULL,
  industry_group_code VARCHAR(30) NOT NULL,
  gics_code VARCHAR(20),
  index_code VARCHAR(30),
  trading_date DATE NOT NULL,
  index_value NUMERIC(18, 4),
  turnover_value NUMERIC(20, 4),
  turnover_volume BIGINT,
  trade_volume BIGINT,
  per NUMERIC(12, 6),
  pbv NUMERIC(12, 6),
  dy NUMERIC(12, 6),
  companies_traded INTEGER,
  companies_listed INTEGER,
  source_market_date_text TEXT,
  import_run_id UUID REFERENCES cse_fetch_runs(id) ON DELETE SET NULL,
  raw_row JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cse_gics_summary_group_date_unique UNIQUE (industry_group_code, trading_date)
);

CREATE TABLE IF NOT EXISTS cse_gics_group_indices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  industry_group_id UUID REFERENCES cse_gics_industry_groups(id) ON DELETE SET NULL,
  industry_group_name TEXT NOT NULL,
  index_code VARCHAR(30) NOT NULL,
  gics_code VARCHAR(20),
  market_timestamp TIMESTAMPTZ,
  trading_date DATE NOT NULL,
  today_index NUMERIC(18, 4),
  previous_index NUMERIC(18, 4),
  index_change NUMERIC(18, 4),
  index_change_percent NUMERIC(12, 6),
  turnover_value NUMERIC(20, 4),
  turnover_volume BIGINT,
  trades BIGINT,
  source_market_timestamp_text TEXT,
  import_run_id UUID REFERENCES cse_fetch_runs(id) ON DELETE SET NULL,
  raw_row JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cse_gics_index_code_date_unique UNIQUE (index_code, trading_date)
);

CREATE TABLE IF NOT EXISTS cse_security_gics_classifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  security_id UUID REFERENCES cse_securities(id) ON DELETE SET NULL,
  symbol VARCHAR(30) NOT NULL,
  normalized_symbol VARCHAR(30) NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  industry_group_id UUID REFERENCES cse_gics_industry_groups(id) ON DELETE SET NULL,
  industry_group_name TEXT NOT NULL,
  industry_group_code VARCHAR(30),
  gics_code VARCHAR(20),
  is_current BOOLEAN NOT NULL DEFAULT true,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_import_run_id UUID REFERENCES cse_fetch_runs(id) ON DELETE SET NULL,
  raw_row JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cse_gics_classification_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  security_id UUID REFERENCES cse_securities(id) ON DELETE SET NULL,
  symbol VARCHAR(30) NOT NULL,
  normalized_symbol VARCHAR(30) NOT NULL,
  company_name TEXT NOT NULL,
  industry_group_id UUID REFERENCES cse_gics_industry_groups(id) ON DELETE SET NULL,
  industry_group_name TEXT NOT NULL,
  trading_date DATE NOT NULL,
  last_traded_time TEXT,
  last_traded_price NUMERIC(18, 4),
  trade_volume BIGINT,
  share_volume BIGINT,
  turnover NUMERIC(20, 4),
  change_amount NUMERIC(18, 4),
  change_percent NUMERIC(12, 6),
  ytd_change_percent NUMERIC(12, 6),
  import_run_id UUID REFERENCES cse_fetch_runs(id) ON DELETE SET NULL,
  raw_row JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cse_gics_snapshot_symbol_date_group_unique UNIQUE (normalized_symbol, trading_date, industry_group_id)
);

CREATE INDEX IF NOT EXISTS idx_cse_gics_groups_name ON cse_gics_industry_groups(industry_group_name);
CREATE INDEX IF NOT EXISTS idx_cse_gics_summary_date ON cse_gics_group_daily_summaries(trading_date DESC);
CREATE INDEX IF NOT EXISTS idx_cse_gics_indices_date ON cse_gics_group_indices(trading_date DESC);
CREATE INDEX IF NOT EXISTS idx_cse_security_gics_group ON cse_security_gics_classifications(industry_group_id);
CREATE INDEX IF NOT EXISTS idx_cse_security_gics_symbol ON cse_security_gics_classifications(normalized_symbol);
CREATE INDEX IF NOT EXISTS idx_cse_gics_snapshot_date ON cse_gics_classification_snapshots(trading_date DESC);

DROP TRIGGER IF EXISTS cse_gics_industry_groups_set_updated_at ON cse_gics_industry_groups;
CREATE TRIGGER cse_gics_industry_groups_set_updated_at
BEFORE UPDATE ON cse_gics_industry_groups
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS cse_gics_group_daily_summaries_set_updated_at ON cse_gics_group_daily_summaries;
CREATE TRIGGER cse_gics_group_daily_summaries_set_updated_at
BEFORE UPDATE ON cse_gics_group_daily_summaries
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS cse_gics_group_indices_set_updated_at ON cse_gics_group_indices;
CREATE TRIGGER cse_gics_group_indices_set_updated_at
BEFORE UPDATE ON cse_gics_group_indices
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS cse_security_gics_classifications_set_updated_at ON cse_security_gics_classifications;
CREATE TRIGGER cse_security_gics_classifications_set_updated_at
BEFORE UPDATE ON cse_security_gics_classifications
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
