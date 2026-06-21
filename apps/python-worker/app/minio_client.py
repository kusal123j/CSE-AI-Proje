from pathlib import Path
from minio import Minio
from minio.error import S3Error
from .config import settings


client = Minio(
    settings.minio_host,
    access_key=settings.minio_access_key,
    secret_key=settings.minio_secret_key,
    secure=settings.minio_use_ssl,
)


class MinioDownloadError(RuntimeError):
    pass


def object_exists(bucket: str, object_key: str) -> bool:
    try:
        client.stat_object(bucket, object_key)
        return True
    except S3Error:
        return False


def download_object(bucket: str, object_key: str, destination: Path) -> Path:
    if not object_exists(bucket, object_key):
        raise MinioDownloadError(f"Object not found in MinIO: {bucket}/{object_key}")

    destination.parent.mkdir(parents=True, exist_ok=True)
    client.fget_object(bucket, object_key, str(destination))

    if not destination.exists():
        raise MinioDownloadError("Downloaded file was not created on disk")

    if destination.stat().st_size <= 0:
        raise MinioDownloadError("Downloaded file is empty")

    return destination
