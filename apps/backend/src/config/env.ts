import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }

  return value;
}, z.boolean());

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  LOG_LEVEL: z.string().default('info'),
  RUN_MIGRATIONS_ON_START: booleanFromEnv.default(false),

  DATABASE_URL: z.string().min(1),

  REDIS_HOST: z.string().default('redis'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),

  MINIO_ENDPOINT: z.string().default('minio'),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_ACCESS_KEY: z.string().default('minioadmin'),
  MINIO_SECRET_KEY: z.string().default('minioadmin'),
  MINIO_BUCKET: z.string().default('cse-documents'),
  MINIO_USE_SSL: booleanFromEnv.default(false),

  QDRANT_URL: z.string().default('http://qdrant:6333'),
  QDRANT_COLLECTION: z.string().default('cse_document_chunks'),
  QDRANT_VECTOR_SIZE: z.coerce.number().default(1536),

  PYTHON_WORKER_URL: z.string().default('http://python-worker:8000'),

  AI_PROVIDER: z.string().optional().default(''),
  AI_API_KEY: z.string().optional().default(''),
  EMBEDDING_MODEL: z.string().optional().default(''),
  CHAT_MODEL: z.string().optional().default(''),

  CSE_MOCK_MODE: booleanFromEnv.default(false),
  MAX_PDF_SIZE_MB: z.coerce.number().positive().default(100),
  PDF_DOWNLOAD_TIMEOUT_MS: z.coerce.number().positive().default(60000),

  CSE_IMPORT_SOURCE_URL: z.string().url().default('https://www.cse.lk/listed-entities/listed-company-directory?page=ALPHABETICAL'),
  CSE_IMPORT_FETCH_MODE: z.literal('python-http').default('python-http'),
  CSE_IMPORT_RAW_STORAGE_DIR: z.string().default('storage/raw/cse/alphabetical'),
  CSE_IMPORT_ARTIFACT_STORAGE_DIR: z.string().default('storage/raw/cse/alphabetical'),
  CSE_IMPORT_MIN_EXPECTED_ROWS: z.coerce.number().positive().default(250),
  CSE_IMPORT_MIN_COMPANIES: z.coerce.number().positive().default(280),
  CSE_IMPORT_MIN_SECURITIES: z.coerce.number().positive().default(280),
  CSE_IMPORT_TIMEOUT_SECONDS: z.coerce.number().positive().default(30),
  CSE_IMPORT_JOB_TIMEOUT_SECONDS: z.coerce.number().positive().default(300),
  CSE_IMPORT_LETTER_TIMEOUT_SECONDS: z.coerce.number().positive().default(30),
  CSE_IMPORT_MAX_RETRIES: z.coerce.number().positive().default(3),
  CSE_IMPORT_RETRY_COUNT: z.coerce.number().positive().default(3),
  CSE_IMPORT_STALE_AFTER_HOURS: z.coerce.number().positive().default(36),
  CSE_IMPORT_USER_AGENT: z.string().default('Mozilla/5.0 compatible CSE Research Assistant Importer'),
  CSE_IMPORT_INTERNAL_SECRET: z.string().optional().default(''),
  CSE_IMPORT_ALLOW_UNPROTECTED_READS: booleanFromEnv.default(true),
  CSE_IMPORT_ALLOW_UNPROTECTED_MANUAL_RUN: booleanFromEnv.default(false),
  CSE_IMPORT_SCHEDULER_ENABLED: booleanFromEnv.default(false),
  CSE_IMPORT_HOUR: z.coerce.number().min(0).max(23).default(16),
  CSE_IMPORT_MINUTE: z.coerce.number().min(0).max(59).default(0),
  CSE_IMPORT_WEEKDAYS_ONLY: booleanFromEnv.default(true),
  CSE_IMPORT_SCHEDULER_INTERVAL_MS: z.coerce.number().positive().default(60000),

  CSE_TRADE_SUMMARY_ENABLED: booleanFromEnv.default(true),
  CSE_TRADE_SUMMARY_SOURCE_URL: z.string().url().default('https://www.cse.lk/equity/trade-summary'),
  CSE_TRADE_SUMMARY_CSV_URL: z.string().optional().default(''),
  CSE_TRADE_SUMMARY_ARTIFACT_STORAGE_DIR: z.string().default('storage/raw/cse/trade-summary'),
  CSE_TRADE_SUMMARY_MIN_EXPECTED_ROWS: z.coerce.number().positive().default(100),
  CSE_TRADE_SUMMARY_TIMEOUT_SECONDS: z.coerce.number().positive().default(90),
  CSE_TRADE_SUMMARY_SCHEDULER_ENABLED: booleanFromEnv.default(false),
  CSE_TRADE_SUMMARY_HOUR: z.coerce.number().min(0).max(23).default(15),
  CSE_TRADE_SUMMARY_MINUTE: z.coerce.number().min(0).max(59).default(45),
  CSE_TRADE_SUMMARY_WEEKDAYS_ONLY: booleanFromEnv.default(true),

  CSE_DAILY_MARKET_SUMMARY_ENABLED: booleanFromEnv.default(true),
  CSE_DAILY_MARKET_SUMMARY_SOURCE_URL: z.string().url().default('https://www.cse.lk/equity/daily-market-summary'),
  CSE_DAILY_MARKET_SUMMARY_ARTIFACT_STORAGE_DIR: z.string().default('storage/raw/cse/daily-market-summary'),
  CSE_DAILY_MARKET_SUMMARY_TIMEOUT_SECONDS: z.coerce.number().positive().default(90),
  CSE_DAILY_MARKET_SUMMARY_SCHEDULER_ENABLED: booleanFromEnv.default(false),
  CSE_DAILY_MARKET_SUMMARY_HOUR: z.coerce.number().min(0).max(23).default(16),
  CSE_DAILY_MARKET_SUMMARY_MINUTE: z.coerce.number().min(0).max(59).default(15),
  CSE_DAILY_MARKET_SUMMARY_WEEKDAYS_ONLY: booleanFromEnv.default(true),

  CSE_GICS_ENABLED: booleanFromEnv.default(true),
  CSE_GICS_SUMMARY_SOURCE_URL: z.string().url().default('https://www.cse.lk/equity/gics-industry-group-summary'),
  CSE_GICS_INDICES_SOURCE_URL: z.string().url().default('https://www.cse.lk/equity/gics-industry-group-indices'),
  CSE_GICS_CLASSIFICATION_SOURCE_URL: z.string().url().default('https://www.cse.lk/listed-entities/gics-classification'),
  CSE_GICS_ARTIFACT_STORAGE_DIR: z.string().default('storage/raw/cse/gics'),
  CSE_GICS_MIN_EXPECTED_GROUPS: z.coerce.number().positive().default(20),
  CSE_GICS_MIN_EXPECTED_CLASSIFICATION_ROWS: z.coerce.number().positive().default(250),
  CSE_GICS_TIMEOUT_SECONDS: z.coerce.number().positive().default(120),

  CSE_COMPANY_PROFILE_ENABLED: booleanFromEnv.default(true),
  CSE_COMPANY_PROFILE_SOURCE_URL: z.string().url().default('https://www.cse.lk/company-profile'),
  CSE_COMPANY_PROFILE_API_URL: z.string().url().default('https://www.cse.lk/api/companyInfoSummery'),
  CSE_COMPANY_PROFILE_TIMEOUT_SECONDS: z.coerce.number().positive().default(90),
  CSE_COMPANY_PROFILE_SCHEDULER_ENABLED: booleanFromEnv.default(false),
  CSE_COMPANY_PROFILE_REFRESH_HOURS: z.coerce.number().positive().default(6),

  CSE_COMPANY_FINANCIAL_REPORTS_ENABLED: booleanFromEnv.default(true),
  CSE_COMPANY_FINANCIAL_REPORTS_API_URL: z.string().url().default('https://www.cse.lk/api/getFinancialAnnouncement'),
  CSE_COMPANY_FINANCIAL_REPORTS_TIMEOUT_SECONDS: z.coerce.number().positive().default(120),
  CSE_COMPANY_FINANCIAL_REPORTS_SCHEDULER_ENABLED: booleanFromEnv.default(false),
  CSE_COMPANY_FINANCIAL_REPORTS_HOUR: z.coerce.number().min(0).max(23).default(18),
  CSE_COMPANY_FINANCIAL_REPORTS_MINUTE: z.coerce.number().min(0).max(59).default(0),
  CSE_COMPANY_FINANCIAL_REPORTS_WEEKDAYS_ONLY: booleanFromEnv.default(true),

  CSE_COMPANY_ANNOUNCEMENTS_ENABLED: booleanFromEnv.default(true),
  CSE_COMPANY_ANNOUNCEMENTS_API_URL: z.string().url().default('https://www.cse.lk/api/approvedAnnouncement'),
  CSE_COMPANY_ANNOUNCEMENTS_TIMEOUT_SECONDS: z.coerce.number().positive().default(120),
  CSE_COMPANY_ANNOUNCEMENTS_SCHEDULER_ENABLED: booleanFromEnv.default(false),
  CSE_COMPANY_ANNOUNCEMENTS_HOUR: z.coerce.number().min(0).max(23).default(18),
  CSE_COMPANY_ANNOUNCEMENTS_MINUTE: z.coerce.number().min(0).max(59).default(30),
  CSE_COMPANY_ANNOUNCEMENTS_WEEKDAYS_ONLY: booleanFromEnv.default(true),
  CSE_COMPANY_ANNOUNCEMENTS_LOOKBACK_DAYS: z.coerce.number().positive().default(7),

  CSE_LATEST_PRICE_POLLER_ENABLED: booleanFromEnv.default(false),
  CSE_LATEST_PRICE_API_URL: z.string().url().default('https://www.cse.lk/api/todaySharePrice'),
  CSE_MARKET_STATUS_API_URL: z.string().url().default('https://www.cse.lk/api/marketStatus'),
  CSE_LATEST_PRICE_TIMEOUT_SECONDS: z.coerce.number().positive().default(60),
  CSE_LATEST_PRICE_POLL_INTERVAL_MS: z.coerce.number().positive().default(180000),
  CSE_LATEST_PRICE_WEEKDAYS_ONLY: booleanFromEnv.default(true),
  CSE_MARKET_OPEN_TIME: z.string().default('10:30'),
  CSE_MARKET_CLOSE_TIME: z.string().default('14:30'),

  CSE_GICS_SCHEDULER_ENABLED: booleanFromEnv.default(false),
});

export const env = envSchema.parse(process.env);
