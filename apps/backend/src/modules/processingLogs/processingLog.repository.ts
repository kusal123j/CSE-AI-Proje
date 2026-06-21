import { query } from '../../config/database';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export interface CreateProcessingLogInput {
  documentId?: string | null;
  jobId?: string | null;
  level?: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
}

export async function createProcessingLog(input: CreateProcessingLogInput) {
  const result = await query(
    `INSERT INTO processing_logs (document_id, job_id, level, message, metadata_json)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING *`,
    [
      input.documentId ?? null,
      input.jobId ?? null,
      input.level ?? 'INFO',
      input.message,
      JSON.stringify(input.metadata ?? {})
    ]
  );
  return result.rows[0];
}

export async function listLogsByDocument(documentId: string) {
  const result = await query(
    `SELECT * FROM processing_logs WHERE document_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [documentId]
  );
  return result.rows;
}
