from pathlib import Path
import fitz  # PyMuPDF
import pdfplumber


class PdfExtractionError(RuntimeError):
    def __init__(self, message: str, error_code: str = "PDF_EXTRACTION_FAILED"):
        self.error_code = error_code
        super().__init__(message)


def validate_pdf_file(pdf_path: Path) -> None:
    if not pdf_path.exists():
        raise PdfExtractionError("PDF file does not exist", "PDF_FILE_MISSING")
    if pdf_path.stat().st_size <= 0:
        raise PdfExtractionError("PDF file is empty", "PDF_FILE_EMPTY")
    with pdf_path.open("rb") as file:
        header = file.read(5)
    if header != b"%PDF-":
        raise PdfExtractionError("File header is not a valid PDF header", "PDF_HEADER_INVALID")


def extract_with_pymupdf(pdf_path: Path) -> list[dict]:
    pages: list[dict] = []
    try:
        doc = fitz.open(str(pdf_path))
    except Exception as exc:
        raise PdfExtractionError("Unable to open PDF with PyMuPDF. File may be corrupt.") from exc

    try:
        if doc.page_count <= 0:
            raise PdfExtractionError("PDF has no pages", "PDF_HAS_NO_PAGES")
        for index, page in enumerate(doc, start=1):
            text = page.get_text("text") or ""
            pages.append({"page_number": index, "text": text, "method": "pymupdf"})
    finally:
        doc.close()
    return pages


def extract_with_pdfplumber(pdf_path: Path) -> list[dict]:
    pages: list[dict] = []
    try:
        with pdfplumber.open(str(pdf_path)) as pdf:
            if not pdf.pages:
                raise PdfExtractionError("PDF has no pages", "PDF_HAS_NO_PAGES")
            for index, page in enumerate(pdf.pages, start=1):
                text = page.extract_text() or ""
                pages.append({"page_number": index, "text": text, "method": "pdfplumber"})
    except PdfExtractionError:
        raise
    except Exception as exc:
        raise PdfExtractionError("Unable to extract PDF with pdfplumber") from exc
    return pages


def extract_pdf_pages(pdf_path: Path) -> tuple[list[dict], str, dict]:
    validate_pdf_file(pdf_path)

    pymupdf_pages = extract_with_pymupdf(pdf_path)
    total_words = sum(len((page["text"] or "").split()) for page in pymupdf_pages)
    warnings: list[str] = []

    if total_words < 50:
        warnings.append("PyMuPDF extraction produced weak text output; pdfplumber fallback attempted")
        plumber_pages = extract_with_pdfplumber(pdf_path)
        plumber_words = sum(len((page["text"] or "").split()) for page in plumber_pages)
        if plumber_words > total_words:
            return plumber_pages, "pdfplumber", {"warnings": warnings, "fallbackUsed": True}

    if total_words < 50:
        warnings.append("Final extracted text is weak. Document may be scanned or image-based.")

    return pymupdf_pages, "pymupdf", {"warnings": warnings, "fallbackUsed": False}
