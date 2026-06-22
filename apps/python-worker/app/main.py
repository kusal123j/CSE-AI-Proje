from pathlib import Path
from tempfile import TemporaryDirectory
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from .logger import logger
from .minio_client import download_object
from .pdf_extractor import extract_pdf_pages, PdfExtractionError
from .db_client import update_document_status, save_processing_log, upsert_document_page
from .config import settings
from .cse_http_importer import CseImportError, run_http_import
from .cse_trade_summary_importer import run_trade_summary_import
from .cse_gics_importer import run_gics_import
from .cse_daily_market_summary_importer import CseDailyMarketSummaryImportError, run_daily_market_summary_import
from .cse_company_profile_importer import run_company_profile_import
from .cse_financial_reports_importer import run_financial_reports_import
from .cse_announcements_importer import run_announcements_import
from .cse_latest_price_importer import run_latest_prices_import

app = FastAPI(title="CSE Python Worker", version="0.2.0")


class ExtractPdfRequest(BaseModel):
    document_id: str = Field(alias="documentId")
    bucket: str
    object_key: str = Field(alias="objectKey")

    class Config:
        populate_by_name = True


class CseImportRequest(BaseModel):
    source_url: str | None = Field(default=None, alias="sourceUrl")
    run_id: str | None = Field(default=None, alias="runId")
    trading_date: str | None = Field(default=None, alias="tradingDate")

    class Config:
        populate_by_name = True


@app.get("/health")
def health():
    return {"status": "ok", "service": "cse-python-worker"}


@app.post("/cse/import/alphabetical")
def cse_import_alphabetical(payload: CseImportRequest):
    source_url = payload.source_url or settings.cse_listed_company_directory_url
    try:
        result = run_http_import(source_url)
        result["runId"] = payload.run_id
        result["tradingDate"] = payload.trading_date
        return result
    except CseImportError as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "status": "failed",
                "errorCode": exc.__class__.__name__,
                "message": str(exc),
                "sourceUrl": source_url,
                "runId": payload.run_id,
            },
        ) from exc


@app.post("/cse/import/trade-summary")
def cse_import_trade_summary(payload: CseImportRequest):
    source_url = payload.source_url or settings.cse_trade_summary_source_url
    try:
        result = run_trade_summary_import(source_url)
        result["runId"] = payload.run_id
        result["tradingDate"] = payload.trading_date
        return result
    except CseImportError as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "status": "failed",
                "errorCode": exc.__class__.__name__,
                "message": str(exc),
                "sourceUrl": source_url,
                "runId": payload.run_id,
            },
        ) from exc


@app.post("/cse/import/daily-market-summary")
def cse_import_daily_market_summary(payload: CseImportRequest):
    source_url = payload.source_url or settings.cse_daily_market_summary_source_url
    try:
        result = run_daily_market_summary_import(source_url)
        result["runId"] = payload.run_id
        result["tradingDate"] = result.get("tradingDate") or payload.trading_date
        return result
    except CseDailyMarketSummaryImportError as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "status": "failed",
                "errorCode": exc.__class__.__name__,
                "message": str(exc),
                "sourceUrl": source_url,
                "runId": payload.run_id,
            },
        ) from exc


class CseGicsImportRequest(BaseModel):
    run_id: str | None = Field(default=None, alias="runId")
    trading_date: str | None = Field(default=None, alias="tradingDate")
    summary_url: str | None = Field(default=None, alias="summaryUrl")
    indices_url: str | None = Field(default=None, alias="indicesUrl")
    classification_url: str | None = Field(default=None, alias="classificationUrl")

    class Config:
        populate_by_name = True


@app.post("/cse/import/gics")
def cse_import_gics(payload: CseGicsImportRequest):
    summary_url = payload.summary_url or settings.cse_gics_summary_source_url
    indices_url = payload.indices_url or settings.cse_gics_indices_source_url
    classification_url = payload.classification_url or settings.cse_gics_classification_source_url
    try:
        result = run_gics_import(summary_url, indices_url, classification_url)
        result["runId"] = payload.run_id
        result["tradingDate"] = payload.trading_date
        return result
    except CseImportError as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "status": "failed",
                "errorCode": exc.__class__.__name__,
                "message": str(exc),
                "sourceUrl": classification_url,
                "runId": payload.run_id,
            },
        ) from exc



class CseCompanyProfileImportRequest(BaseModel):
    symbol: str
    source_url: str = Field(alias="sourceUrl")
    api_url: str = Field(alias="apiUrl")

    class Config:
        populate_by_name = True


class CseCompanyFinancialsImportRequest(BaseModel):
    symbol: str
    api_url: str = Field(alias="apiUrl")

    class Config:
        populate_by_name = True


class CseCompanyAnnouncementsImportRequest(BaseModel):
    symbol: str
    start_date: str = Field(alias="startDate")
    end_date: str = Field(alias="endDate")
    api_url: str = Field(alias="apiUrl")

    class Config:
        populate_by_name = True


class CseLatestPricesImportRequest(BaseModel):
    api_url: str = Field(alias="apiUrl")
    market_status_url: str | None = Field(default=None, alias="marketStatusUrl")
    skip_when_market_closed: bool = Field(default=False, alias="skipWhenMarketClosed")

    class Config:
        populate_by_name = True


@app.post("/cse/import/company-profile")
def cse_import_company_profile(payload: CseCompanyProfileImportRequest):
    try:
        return run_company_profile_import(payload.symbol, payload.source_url, payload.api_url)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={"status": "failed", "errorCode": exc.__class__.__name__, "message": str(exc), "symbol": payload.symbol},
        ) from exc


@app.post("/cse/import/company-financials")
def cse_import_company_financials(payload: CseCompanyFinancialsImportRequest):
    try:
        return run_financial_reports_import(payload.symbol, payload.api_url)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={"status": "failed", "errorCode": exc.__class__.__name__, "message": str(exc), "symbol": payload.symbol},
        ) from exc


@app.post("/cse/import/company-announcements")
def cse_import_company_announcements(payload: CseCompanyAnnouncementsImportRequest):
    try:
        return run_announcements_import(payload.symbol, payload.start_date, payload.end_date, payload.api_url)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={"status": "failed", "errorCode": exc.__class__.__name__, "message": str(exc), "symbol": payload.symbol},
        ) from exc


@app.post("/cse/import/latest-prices")
def cse_import_latest_prices(payload: CseLatestPricesImportRequest):
    try:
        return run_latest_prices_import(payload.api_url, payload.market_status_url, payload.skip_when_market_closed)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={"status": "failed", "errorCode": exc.__class__.__name__, "message": str(exc)},
        ) from exc


@app.post("/extract-pdf")
def extract_pdf(payload: ExtractPdfRequest):
    document_id = payload.document_id
    try:
        update_document_status(document_id, "EXTRACTING")
        save_processing_log(
            document_id,
            "INFO",
            "Python worker started PDF extraction",
            {"bucket": payload.bucket, "objectKey": payload.object_key},
        )

        with TemporaryDirectory() as tmp_dir:
            pdf_path = Path(tmp_dir) / "source.pdf"
            download_object(payload.bucket, payload.object_key, pdf_path)
            pages, method, diagnostics = extract_pdf_pages(pdf_path)

            total_words = 0
            for page in pages:
                text = page.get("text") or ""
                total_words += len(text.split())
                upsert_document_page(
                    document_id=document_id,
                    page_number=page["page_number"],
                    text=text,
                    extraction_method=page.get("method") or method,
                )

        if diagnostics.get("warnings"):
            save_processing_log(
                document_id,
                "WARN",
                "PDF extraction completed with warnings",
                {"warnings": diagnostics.get("warnings"), "method": method},
            )

        update_document_status(document_id, "EXTRACTED")
        save_processing_log(
            document_id,
            "INFO",
            "Python worker completed PDF extraction",
            {"pagesExtracted": len(pages), "totalWords": total_words, "method": method, "diagnostics": diagnostics},
        )

        return {
            "documentId": document_id,
            "status": "EXTRACTED",
            "pagesExtracted": len(pages),
            "totalWords": total_words,
            "method": method,
            "diagnostics": diagnostics,
        }
    except Exception as exc:
        logger.exception("PDF extraction failed")
        error_code = exc.error_code if isinstance(exc, PdfExtractionError) else "PDF_EXTRACTION_FAILED"
        message = str(exc)
        try:
            update_document_status(document_id, "FAILED", message)
            save_processing_log(
                document_id,
                "ERROR",
                "Python worker PDF extraction failed",
                {"errorCode": error_code, "error": message},
            )
        except Exception:
            logger.exception("Failed to save extraction error status/log")
        raise HTTPException(
            status_code=500,
            detail={
                "status": "FAILED",
                "errorCode": error_code,
                "message": message,
                "documentId": document_id,
            },
        ) from exc
