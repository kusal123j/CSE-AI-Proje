import { query } from '../../config/database';

export type ProcessingJobType = 'DOCUMENT_DOWNLOAD' | 'PDF_EXTRACT' | 'DOCUMENT_CHUNK' | 'EMBEDDING' | 'AI_SUMMARY';
export type ProcessingJobStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'RETRYING' | 'CANCELLED';

export async function createProcessingJob(input: {
  queueName: string;
  bullmqJobId?: string | null;
  documentId?: string | null;
  jobType: ProcessingJobType;
  status?: ProcessingJobStatus;
  maxAttempts?: number;
}) {
  const result = await query(
    `INSERT INTO processing_jobs (queue_name, bullmq_job_id, document_id, job_type, status, max_attempts)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.queueName,
      input.bullmqJobId ?? null,
      input.documentId ?? null,
      input.jobType,
      input.status ?? 'PENDING',
      input.maxAttempts ?? 3
    ]
  );
  return result.rows[0];
}

export async function updateProcessingJobBullId(id: string, bullmqJobId: string) {
  const result = await query(
    `UPDATE processing_jobs SET bullmq_job_id = $2 WHERE id = $1 RETURNING *`,
    [id, bullmqJobId]
  );
  return result.rows[0];
}

export async function markProcessingJobActiveByBullId(bullmqJobId: string, queueName: string) {
  const result = await query(
    `UPDATE processing_jobs
     SET status = 'ACTIVE', started_at = COALESCE(started_at, NOW()), attempts = attempts + 1
     WHERE bullmq_job_id = $1 AND queue_name = $2
     RETURNING *`,
    [bullmqJobId, queueName]
  );
  return result.rows[0] ?? null;
}

export async function markProcessingJobCompletedByBullId(bullmqJobId: string, queueName: string) {
  const result = await query(
    `UPDATE processing_jobs
     SET status = 'COMPLETED', completed_at = NOW(), error_message = NULL
     WHERE bullmq_job_id = $1 AND queue_name = $2
     RETURNING *`,
    [bullmqJobId, queueName]
  );
  return result.rows[0] ?? null;
}

export async function markProcessingJobFailedByBullId(bullmqJobId: string, queueName: string, errorMessage: string) {
  const result = await query(
    `UPDATE processing_jobs
     SET status = 'FAILED', failed_at = NOW(), error_message = $3
     WHERE bullmq_job_id = $1 AND queue_name = $2
     RETURNING *`,
    [bullmqJobId, queueName, errorMessage]
  );
  return result.rows[0] ?? null;
}

export async function listProcessingJobs(filters: { documentId?: string; status?: string }) {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.documentId) {
    values.push(filters.documentId);
    conditions.push(`document_id = $${values.length}`);
  }

  if (filters.status) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(`SELECT * FROM processing_jobs ${where} ORDER BY created_at DESC LIMIT 200`, values);
  return result.rows;
}

export async function findProcessingJobById(id: string) {
  const result = await query(`SELECT * FROM processing_jobs WHERE id = $1 LIMIT 1`, [id]);
  return result.rows[0] ?? null;
}

export async function findActiveJobForDocument(documentId: string, jobType: ProcessingJobType) {
  const result = await query(
    `SELECT * FROM processing_jobs
     WHERE document_id = $1
       AND job_type = $2
       AND status IN ('PENDING', 'ACTIVE', 'RETRYING')
     ORDER BY created_at DESC
     LIMIT 1`,
    [documentId, jobType]
  );
  return result.rows[0] ?? null;
}

export async function markProcessingJobRetrying(id: string) {
  const result = await query(
    `UPDATE processing_jobs SET status = 'RETRYING', error_message = NULL WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0] ?? null;
}
