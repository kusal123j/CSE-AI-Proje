import { query } from '../../config/database';
import { DocumentStatus, DocumentType } from './document.types';

export interface CreateDocumentData {
  companyId?: string | null;
  symbol: string;
  documentType: DocumentType;
  title: string;
  sourceUrl?: string | null;
  sourceDocumentId?: string | null;
  financialYear?: string | null;
  period?: string | null;
  publishedDate?: string | null;
  fileName?: string | null;
}

export interface UpdateStorageData {
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  checksum?: string | null;
  minioBucket?: string | null;
  minioObjectKey?: string | null;
  status?: DocumentStatus;
}

export async function createDocument(data: CreateDocumentData) {
  const result = await query(
    `INSERT INTO documents (
       company_id, symbol, document_type, title, source_url, source_document_id,
       financial_year, period, published_date, file_name
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      data.companyId ?? null,
      data.symbol,
      data.documentType,
      data.title,
      data.sourceUrl ?? null,
      data.sourceDocumentId ?? null,
      data.financialYear ?? null,
      data.period ?? null,
      data.publishedDate ?? null,
      data.fileName ?? null
    ]
  );
  return result.rows[0];
}

export async function listDocuments(filters: { symbol?: string; status?: string; documentType?: string }) {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.symbol) {
    values.push(filters.symbol);
    conditions.push(`symbol = $${values.length}`);
  }

  if (filters.status) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }

  if (filters.documentType) {
    values.push(filters.documentType);
    conditions.push(`document_type = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(`SELECT * FROM documents ${where} ORDER BY created_at DESC LIMIT 200`, values);
  return result.rows;
}

export async function findDocumentById(id: string) {
  const result = await query(`SELECT * FROM documents WHERE id = $1 LIMIT 1`, [id]);
  return result.rows[0] ?? null;
}

export async function findDocumentBySourceUrl(sourceUrl: string) {
  const result = await query(`SELECT * FROM documents WHERE source_url = $1 LIMIT 1`, [sourceUrl]);
  return result.rows[0] ?? null;
}

export async function findDocumentByChecksum(checksum: string) {
  const result = await query(`SELECT * FROM documents WHERE checksum = $1 AND status <> 'DUPLICATE' LIMIT 1`, [checksum]);
  return result.rows[0] ?? null;
}

export async function findDocumentByBusinessKey(input: {
  companyId: string;
  documentType: DocumentType;
  financialYear?: string | null;
  period?: string | null;
}) {
  const result = await query(
    `SELECT * FROM documents
     WHERE company_id = $1
       AND document_type = $2
       AND COALESCE(financial_year, '') = COALESCE($3, '')
       AND COALESCE(period, '') = COALESCE($4, '')
       AND is_duplicate = false
       AND status <> 'DUPLICATE'
     LIMIT 1`,
    [input.companyId, input.documentType, input.financialYear ?? null, input.period ?? null]
  );
  return result.rows[0] ?? null;
}

export async function updateDocumentStatus(id: string, status: DocumentStatus, errorMessage?: string | null) {
  const result = await query(
    `UPDATE documents SET status = $2, error_message = $3 WHERE id = $1 RETURNING *`,
    [id, status, errorMessage ?? null]
  );
  return result.rows[0] ?? null;
}

export async function clearDocumentError(id: string) {
  const result = await query(`UPDATE documents SET error_message = NULL WHERE id = $1 RETURNING *`, [id]);
  return result.rows[0] ?? null;
}

export async function markDocumentDuplicate(id: string, duplicateOfDocumentId: string, reason: string) {
  const result = await query(
    `UPDATE documents
     SET status = 'DUPLICATE',
         is_duplicate = true,
         duplicate_of_document_id = $2,
         duplicate_reason = $3,
         error_message = NULL
     WHERE id = $1
     RETURNING *`,
    [id, duplicateOfDocumentId, reason]
  );
  return result.rows[0] ?? null;
}

export async function updateDocumentStorage(id: string, data: UpdateStorageData) {
  const result = await query(
    `UPDATE documents
     SET file_name = COALESCE($2, file_name),
         mime_type = COALESCE($3, mime_type),
         file_size = COALESCE($4, file_size),
         checksum = COALESCE($5, checksum),
         minio_bucket = COALESCE($6, minio_bucket),
         minio_object_key = COALESCE($7, minio_object_key),
         status = COALESCE($8::document_status, status),
         error_message = NULL
     WHERE id = $1
     RETURNING *`,
    [
      id,
      data.fileName ?? null,
      data.mimeType ?? null,
      data.fileSize ?? null,
      data.checksum ?? null,
      data.minioBucket ?? null,
      data.minioObjectKey ?? null,
      data.status ?? null
    ]
  );
  return result.rows[0] ?? null;
}

export async function listDocumentPages(documentId: string) {
  const result = await query(
    `SELECT id, document_id, page_number, text, char_count, word_count, extraction_method, created_at, updated_at
     FROM document_pages
     WHERE document_id = $1
     ORDER BY page_number ASC`,
    [documentId]
  );
  return result.rows;
}
