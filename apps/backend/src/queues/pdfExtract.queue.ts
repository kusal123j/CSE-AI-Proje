import axios from 'axios';
import { Job, JobsOptions, Queue, Worker } from 'bullmq';
import { redisConnectionOptions } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { QUEUE_NAMES } from './queueNames';
import { createProcessingLog } from '../modules/processingLogs/processingLog.repository';
import * as jobRepo from '../modules/jobs/job.repository';
import { documentService } from '../modules/documents/document.service';

export interface PdfExtractJobData {
  documentId: string;
  bucket: string;
  objectKey: string;
}

export const pdfExtractQueue = new Queue<PdfExtractJobData, unknown, string>(QUEUE_NAMES.PDF_EXTRACT, {
  connection: redisConnectionOptions
});

export async function addPdfExtractJob(data: PdfExtractJobData) {
  const dbJob = await jobRepo.createProcessingJob({
    queueName: QUEUE_NAMES.PDF_EXTRACT,
    documentId: data.documentId,
    jobType: 'PDF_EXTRACT',
    status: 'PENDING'
  });

  const options: JobsOptions = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500
  };

  const job = await pdfExtractQueue.add('extract-pdf', data, options);
  await jobRepo.updateProcessingJobBullId(dbJob.id, String(job.id));
  await createProcessingLog({
    documentId: data.documentId,
    jobId: dbJob.id,
    level: 'INFO',
    message: 'PDF extraction job queued',
    metadata: { bullmqJobId: job.id, objectKey: data.objectKey }
  });
  return job;
}

async function processPdfExtract(job: Job<PdfExtractJobData>) {
  const { documentId, bucket, objectKey } = job.data;
  await jobRepo.markProcessingJobActiveByBullId(String(job.id), QUEUE_NAMES.PDF_EXTRACT);
  await createProcessingLog({ documentId, level: 'INFO', message: 'PDF extraction started', metadata: { bucket, objectKey } });

  try {
    await documentService.updateStatus(documentId, 'EXTRACTING');
    const response = await axios.post(
      `${env.PYTHON_WORKER_URL}/extract-pdf`,
      { documentId, bucket, objectKey },
      { timeout: 180000 }
    );

    await jobRepo.markProcessingJobCompletedByBullId(String(job.id), QUEUE_NAMES.PDF_EXTRACT);
    await createProcessingLog({
      documentId,
      level: 'INFO',
      message: 'PDF extraction completed by Python worker',
      metadata: response.data
    });
    return response.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown PDF extraction error';
    await documentService.updateStatus(documentId, 'FAILED', message);
    await jobRepo.markProcessingJobFailedByBullId(String(job.id), QUEUE_NAMES.PDF_EXTRACT, message);
    await createProcessingLog({ documentId, level: 'ERROR', message: 'PDF extraction failed', metadata: { error: message } });
    throw error;
  }
}

export function startPdfExtractWorker() {
  const worker = new Worker<PdfExtractJobData, unknown, string>(QUEUE_NAMES.PDF_EXTRACT, processPdfExtract, {
    connection: redisConnectionOptions,
    concurrency: 1
  });

  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'PDF extraction job completed'));
  worker.on('failed', (job, error) => logger.error({ jobId: job?.id, error }, 'PDF extraction job failed'));

  return worker;
}
