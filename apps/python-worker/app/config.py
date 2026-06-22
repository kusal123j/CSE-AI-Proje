import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


def _bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "postgresql://cse_user:cse_password@postgres:5432/cse_research")
    minio_endpoint: str = os.getenv("MINIO_ENDPOINT", "minio")
    minio_port: int = int(os.getenv("MINIO_PORT", "9000"))
    minio_access_key: str = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    minio_secret_key: str = os.getenv("MINIO_SECRET_KEY", "minioadmin")
    minio_use_ssl: bool = _bool(os.getenv("MINIO_USE_SSL"), False)
    worker_port: int = int(os.getenv("PYTHON_WORKER_PORT", "8000"))
    cse_import_mode: str = os.getenv("CSE_IMPORT_MODE", os.getenv("CSE_IMPORT_FETCH_MODE", "python-http"))
    cse_listed_company_directory_url: str = os.getenv(
        "CSE_LISTED_COMPANY_DIRECTORY_URL",
        os.getenv("CSE_IMPORT_SOURCE_URL", "https://www.cse.lk/listed-entities/listed-company-directory?page=ALPHABETICAL"),
    )
    cse_import_timeout_seconds: int = int(os.getenv("CSE_IMPORT_TIMEOUT_SECONDS", "30"))
    cse_import_letter_timeout_seconds: int = int(os.getenv("CSE_IMPORT_LETTER_TIMEOUT_SECONDS", os.getenv("CSE_IMPORT_TIMEOUT_SECONDS", "30")))
    cse_import_max_retries: int = int(os.getenv("CSE_IMPORT_MAX_RETRIES", "3"))
    cse_import_retry_count: int = int(os.getenv("CSE_IMPORT_RETRY_COUNT", os.getenv("CSE_IMPORT_MAX_RETRIES", "3")))
    cse_import_user_agent: str = os.getenv(
        "CSE_IMPORT_USER_AGENT",
        "Mozilla/5.0 compatible CSE Research Assistant Importer",
    )
    cse_trade_summary_source_url: str = os.getenv(
        "CSE_TRADE_SUMMARY_SOURCE_URL",
        "https://www.cse.lk/equity/trade-summary",
    )
    cse_trade_summary_csv_url: str = os.getenv("CSE_TRADE_SUMMARY_CSV_URL", "")
    cse_trade_summary_min_expected_rows: int = int(os.getenv("CSE_TRADE_SUMMARY_MIN_EXPECTED_ROWS", "100"))
    cse_daily_market_summary_source_url: str = os.getenv(
        "CSE_DAILY_MARKET_SUMMARY_SOURCE_URL",
        "https://www.cse.lk/equity/daily-market-summary",
    )
    cse_daily_market_summary_timeout_seconds: int = int(os.getenv("CSE_DAILY_MARKET_SUMMARY_TIMEOUT_SECONDS", "90"))

    cse_company_profile_timeout_seconds: int = int(os.getenv("CSE_COMPANY_PROFILE_TIMEOUT_SECONDS", "90"))
    cse_company_financial_reports_timeout_seconds: int = int(os.getenv("CSE_COMPANY_FINANCIAL_REPORTS_TIMEOUT_SECONDS", "120"))
    cse_company_announcements_timeout_seconds: int = int(os.getenv("CSE_COMPANY_ANNOUNCEMENTS_TIMEOUT_SECONDS", "120"))
    cse_latest_price_timeout_seconds: int = int(os.getenv("CSE_LATEST_PRICE_TIMEOUT_SECONDS", "60"))

    cse_gics_summary_source_url: str = os.getenv(
        "CSE_GICS_SUMMARY_SOURCE_URL",
        "https://www.cse.lk/equity/gics-industry-group-summary",
    )
    cse_gics_indices_source_url: str = os.getenv(
        "CSE_GICS_INDICES_SOURCE_URL",
        "https://www.cse.lk/equity/gics-industry-group-indices",
    )
    cse_gics_classification_source_url: str = os.getenv(
        "CSE_GICS_CLASSIFICATION_SOURCE_URL",
        "https://www.cse.lk/listed-entities/gics-classification",
    )
    cse_gics_timeout_seconds: int = int(os.getenv("CSE_GICS_TIMEOUT_SECONDS", "120"))
    cse_gics_min_expected_groups: int = int(os.getenv("CSE_GICS_MIN_EXPECTED_GROUPS", "20"))
    cse_gics_min_expected_classification_rows: int = int(os.getenv("CSE_GICS_MIN_EXPECTED_CLASSIFICATION_ROWS", "250"))

    @property
    def minio_host(self) -> str:
        return f"{self.minio_endpoint}:{self.minio_port}"


settings = Settings()
