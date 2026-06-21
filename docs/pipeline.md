# Document Pipeline

## Foundation v1.1 flow

```text
Document metadata created
  ↓
DOCUMENT_DOWNLOAD job queued
  ↓
PDF downloaded from source_url
  ↓
PDF validation runs
  ↓
checksum duplicate detection runs
  ↓
valid original PDF uploaded to MinIO
  ↓
document status = STORED
  ↓
PDF_EXTRACT job is queued automatically
  ↓
document status = EXTRACTING
  ↓
Python worker downloads PDF from MinIO
  ↓
Python worker extracts text page by page
  ↓
document_pages rows saved in PostgreSQL
  ↓
document status = EXTRACTED
```

## PDF validation rules

Before MinIO upload, the backend checks:

- source URL is HTTP/HTTPS
- response is not empty
- response size is within MAX_PDF_SIZE_MB
- file header starts with `%PDF-`
- content type is PDF-compatible or URL ends in `.pdf`

Invalid files are not uploaded to MinIO. The document is marked `FAILED`, and a processing log is saved.

## Duplicate handling

The system checks:

- duplicate source URL before document creation
- duplicate annual/interim report by company + type + financial year + period
- duplicate checksum after download

Checksum duplicates are marked with:

```text
status = DUPLICATE
is_duplicate = true
duplicate_of_document_id = original document id
```

## Retry rules

Retry is allowed only for failed jobs.

Retry is blocked when the document is already completed, actively processing, or marked as duplicate.
