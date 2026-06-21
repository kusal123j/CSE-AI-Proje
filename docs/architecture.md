# Architecture

```text
Express Backend Collector / API
   ↓
Downloads official CSE documents
   ↓
Validates PDF response
   ↓
Stores original PDF in MinIO
   ↓
Saves metadata and status in PostgreSQL
   ↓
Adds background jobs to Redis/BullMQ
   ↓
Python worker extracts PDF text page-by-page
   ↓
PostgreSQL stores extracted pages
   ↓
LangChain chunks pages and prepares RAG flow
   ↓
Qdrant stores vectors with metadata later
   ↓
AI summaries and Q&A use source-backed retrieval later
```

## Services

- `backend`: Express.js API and BullMQ workers
- `python-worker`: FastAPI service for PDF extraction
- `postgres`: truth database
- `redis`: queue backend
- `minio`: original PDF storage
- `qdrant`: vector database

## v1.1 reliability rules

- Do not upload invalid PDFs to MinIO.
- Do not silently fail jobs.
- Mark checksum duplicates as `DUPLICATE` instead of crashing.
- Automatically queue extraction after a successful download.
- Block unsafe retries for active, duplicate, or completed documents.

## Important rule

LangChain is used only for RAG orchestration. Core data fetching, database status flow, MinIO storage, PDF extraction, retries, and financial calculations must remain in normal backend/Python code.
