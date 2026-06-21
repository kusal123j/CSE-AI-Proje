import json
import psycopg2
from psycopg2.extras import Json
from .config import settings


def get_connection():
    return psycopg2.connect(settings.database_url)


def update_document_status(document_id: str, status: str, error_message: str | None = None):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE documents
                SET status = %s::document_status, error_message = %s
                WHERE id = %s
                """,
                (status, error_message, document_id),
            )


def save_processing_log(document_id: str, level: str, message: str, metadata: dict | None = None):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO processing_logs (document_id, level, message, metadata_json)
                VALUES (%s, %s::log_level, %s, %s)
                """,
                (document_id, level, message, Json(metadata or {})),
            )


def upsert_document_page(
    document_id: str,
    page_number: int,
    text: str,
    extraction_method: str,
):
    char_count = len(text or "")
    word_count = len((text or "").split())
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO document_pages (
                    document_id, page_number, text, char_count, word_count, extraction_method
                ) VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (document_id, page_number)
                DO UPDATE SET
                    text = EXCLUDED.text,
                    char_count = EXCLUDED.char_count,
                    word_count = EXCLUDED.word_count,
                    extraction_method = EXCLUDED.extraction_method
                """,
                (document_id, page_number, text or "", char_count, word_count, extraction_method),
            )
