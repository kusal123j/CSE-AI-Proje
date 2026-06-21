import { AppError } from '../../middleware/errorHandler';
import { createProcessingLog } from '../processingLogs/processingLog.repository';
import { documentService } from '../documents/document.service';
import * as repo from './job.repository';

const BLOCKED_DOCUMENT_STATUSES = new Set(['DOWNLOADING', 'EXTRACTING', 'CHUNKING', 'EMBEDDING', 'ANALYZING']);
const COMPLETED_DOCUMENT_STATUSES = new Set(['EXTRACTED', 'CHUNKED', 'EMBEDDED', 'ANALYZED']);

export const jobService = {
  list(filters: { documentId?: string; status?: string }) {
    return repo.listProcessingJobs(filters);
  },

  async retry(id: string) {
    const job = await repo.findProcessingJobById(id);
    if (!job) throw new AppError(404, 'Processing job not found');
    if (!job.document_id) throw new AppError(400, 'Job has no document to retry');
    if (job.status !== 'FAILED') {
      throw new AppError(409, `Only FAILED jobs can be retried. Current job status is ${job.status}`);
    }

    const document = await documentService.get(job.document_id);
    if (document.status === 'DUPLICATE') {
      throw new AppError(409, 'Duplicate documents cannot be retried');
    }
    if (COMPLETED_DOCUMENT_STATUSES.has(document.status)) {
      throw new AppError(409, `Document already reached ${document.status}; retry is blocked`);
    }
    if (BLOCKED_DOCUMENT_STATUSES.has(document.status)) {
      throw new AppError(409, `Document is currently ${document.status}; retry is blocked`);
    }

    const activeJob = await repo.findActiveJobForDocument(job.document_id, job.job_type);
    if (activeJob && activeJob.id !== job.id) {
      throw new AppError(409, 'An active job already exists for this document and job type', {
        activeJobId: activeJob.id,
        activeJobStatus: activeJob.status
      });
    }

    await repo.markProcessingJobRetrying(id);
    await createProcessingLog({
      documentId: job.document_id,
      jobId: id,
      level: 'INFO',
      message: 'Retry requested for failed job',
      metadata: { jobType: job.job_type }
    });

    if (job.job_type === 'DOCUMENT_DOWNLOAD') {
      return documentService.queueDownload(job.document_id, { forceRetry: true });
    }

    if (job.job_type === 'PDF_EXTRACT') {
      return documentService.queueExtract(job.document_id, { forceRetry: true });
    }

    throw new AppError(400, `Retry is not implemented yet for ${job.job_type}`);
  }
};
