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

    @property
    def minio_host(self) -> str:
        return f"{self.minio_endpoint}:{self.minio_port}"


settings = Settings()
