# CSE Document Retry Workflow

Financial reports and announcements can be retried without rediscovering all company data.

Operator endpoints:

- `POST /api/cse/company-financial-reports/:id/retry-document`
- `POST /api/cse/company-announcements/:id/retry-document`

Retry behavior:

1. Validate the report/announcement row exists.
2. Validate the PDF URL through the CSE source guard.
3. Reuse or recreate the linked `documents` row.
4. Queue PDF download/extraction through the existing document pipeline.
5. Return the linked document id/status.

Invalid or non-CSE PDF URLs are rejected and never enter the document queue.
