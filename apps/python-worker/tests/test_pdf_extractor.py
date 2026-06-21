from pathlib import Path
import pytest
from app.pdf_extractor import validate_pdf_file, PdfExtractionError


def test_validate_pdf_file_rejects_missing_file(tmp_path: Path):
    with pytest.raises(PdfExtractionError) as exc:
        validate_pdf_file(tmp_path / "missing.pdf")
    assert exc.value.error_code == "PDF_FILE_MISSING"


def test_validate_pdf_file_rejects_invalid_header(tmp_path: Path):
    path = tmp_path / "bad.pdf"
    path.write_bytes(b"<html>not pdf</html>")
    with pytest.raises(PdfExtractionError) as exc:
        validate_pdf_file(path)
    assert exc.value.error_code == "PDF_HEADER_INVALID"


def test_validate_pdf_file_accepts_pdf_header(tmp_path: Path):
    path = tmp_path / "ok.pdf"
    path.write_bytes(b"%PDF-1.7\n")
    validate_pdf_file(path)
