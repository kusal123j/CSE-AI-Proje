# Database Foundation

Initial tables:

- `companies`
- `documents`
- `document_pages`
- `processing_jobs`
- `processing_logs`
- `ai_report_summaries`

The full schema is in:

```text
apps/backend/src/database/schema.sql
```

## Document status flow

```text
DISCOVERED → DOWNLOADING → STORED → EXTRACTING → EXTRACTED → CHUNKING → CHUNKED → EMBEDDING → EMBEDDED → ANALYZING → ANALYZED
```

Failure/skip statuses:

```text
FAILED
DUPLICATE
```

`DUPLICATE` is used when a downloaded checksum or business key already matches an existing document. The duplicate record stores:

- `is_duplicate`
- `duplicate_of_document_id`
- `duplicate_reason`

Every failed operation must save an error message and a processing log.

## Duplicate strategy

The foundation prevents or marks duplicates using:

- unique `source_url`
- unique `checksum`
- annual/interim business key: company + document type + financial year + period
- post-download checksum comparison

Announcements are not restricted by the annual/interim business-key index because a company can have many announcements in the same year.
