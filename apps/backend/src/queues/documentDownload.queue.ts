import axios from 'axios';
import { Job, JobsOptions, Queue, Worker } from 'bullmq';
import { redisConnectionOptions } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { QUEUE_NAMES } from './queueNames';
import { createProcessingLog } from '../modules/processingLogs/processingLog.repository';
import * as jobRepo from '../modules/jobs/job.repository';
import { documentService } from '../modules/documents/document.service';
import { storageService } from '../modules/storage/storage.service';
import { sha256 } from '../utils/checksum';
import { validatePdfDownload } from '../utils/pdfValidation';
import { addPdfExtractJob } from './pdfExtract.queue';
import { assertAllowedCsePdfUrl } from '../modules/cse/cse.sourceGuard';
import { updateLinkedCseDocumentStatus } from '../modules/cse/cse.companyIntelligence.repository';

export interface DocumentDownloadJobData {
  documentId: string;
  sourceUrl: string;
  symbol: string;
}

export const documentDownloadQueue = new Queue<DocumentDownloadJobData, unknown, string>(QUEUE_NAMES.DOCUMENT_DOWNLOAD, {
  connection: redisConnectionOptions
});

export async function addDocumentDownloadJob(data: DocumentDownloadJobData) {
  const dbJob = await jobRepo.createProcessingJob({
    queueName: QUEUE_NAMES.DOCUMENT_DOWNLOAD,
    documentId: data.documentId,
    jobType: 'DOCUMENT_DOWNLOAD',
    status: 'PENDING'
  });

  const options: JobsOptions = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500
  };

  const job = await documentDownloadQueue.add('download-document', data, options);
  await jobRepo.updateProcessingJobBullId(dbJob.id, String(job.id));
  await createProcessingLog({
    documentId: data.documentId,
    jobId: dbJob.id,
    level: 'INFO',
    message: 'Document download job queued',
    metadata: { bullmqJobId: job.id, sourceUrl: data.sourceUrl }
  });
  return job;
}

async function processDocumentDownload(job: Job<DocumentDownloadJobData>) {
  const { documentId, sourceUrl } = job.data;
  await jobRepo.markProcessingJobActiveByBullId(String(job.id), QUEUE_NAMES.DOCUMENT_DOWNLOAD);

  try {
    const normalizedSourceUrl = assertAllowedCsePdfUrl(sourceUrl);
    await createProcessingLog({ documentId, level: 'INFO', message: 'PDF download started', metadata: { sourceUrl, normalizedSourceUrl } });
    const document = await documentService.get(documentId);
    const downloadUrl = assertAllowedCsePdfUrl(document.source_url || normalizedSourceUrl);
    await updateLinkedCseDocumentStatus(documentId, 'DOWNLOADING', null).catch(() => undefined);
    const response = await axios.get<ArrayBuffer>(downloadUrl, {
      responseType: 'arraybuffer',
      timeout: env.PDF_DOWNLOAD_TIMEOUT_MS,
      maxContentLength: env.MAX_PDF_SIZE_MB * 1024 * 1024,
      maxBodyLength: env.MAX_PDF_SIZE_MB * 1024 * 1024,
      headers: {
        'User-Agent': 'CSE-Research-Assistant/0.1 (+research-document-collector)',
        Accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.5'
      }
    });

    const buffer = Buffer.from(response.data);
    const validation = validatePdfDownload({
      sourceUrl: downloadUrl,
      buffer,
      contentType: response.headers['content-type']?.toString(),
      contentLength: response.headers['content-length'] ? Number(response.headers['content-length']) : null
    });

    const checksum = sha256(buffer);
    const checksumDuplicate = await documentService.findByChecksum(checksum);
    if (checksumDuplicate && checksumDuplicate.id !== documentId) {
      await documentService.markDuplicate(documentId, checksumDuplicate.id, 'CHECKSUM');
      await updateLinkedCseDocumentStatus(documentId, 'DUPLICATE', `Duplicate of document ${checksumDuplicate.id}`).catch(() => undefined);
      await jobRepo.markProcessingJobCompletedByBullId(String(job.id), QUEUE_NAMES.DOCUMENT_DOWNLOAD);
      await createProcessingLog({
        documentId,
        level: 'WARN',
        message: 'Downloaded PDF checksum matched an existing document. Marked as duplicate and skipped upload.',
        metadata: { checksum, duplicateOfDocumentId: checksumDuplicate.id }
      });
      return { documentId, status: 'DUPLICATE', duplicateOfDocumentId: checksumDuplicate.id };
    }

    const fileName = document.file_name || `${document.symbol}-${document.document_type}-${document.financial_year || 'unknown'}.pdf`;
    const objectKey = storageService.buildObjectKey({
      symbol: document.symbol,
      documentType: document.document_type,
      financialYear: document.financial_year,
      documentId,
      fileName
    });

    const upload = await storageService.uploadBuffer(objectKey, buffer, validation.normalizedContentType);

    await documentService.updateStorage(documentId, {
      fileName,
      mimeType: validation.normalizedContentType,
      fileSize: validation.fileSize,
      checksum,
      minioBucket: upload.bucket,
      minioObjectKey: upload.objectKey,
      status: 'STORED'
    });

    await updateLinkedCseDocumentStatus(documentId, 'STORED', null).catch(() => undefined);

    await createProcessingLog({
      documentId,
      level: 'INFO',
      message: 'PDF downloaded and uploaded to MinIO',
      metadata: { checksum, objectKey: upload.objectKey, size: validation.fileSize }
    });

    const extractJob = await addPdfExtractJob({
      documentId,
      bucket: upload.bucket,
      objectKey: upload.objectKey
    });
    await documentService.updateStatus(documentId, 'EXTRACTING');
    await updateLinkedCseDocumentStatus(documentId, 'EXTRACTING', null).catch(() => undefined);
    await createProcessingLog({
      documentId,
      level: 'INFO',
      message: 'PDF extraction job queued automatically after successful download',
      metadata: { bullmqJobId: extractJob.id, queue: extractJob.queueName }
    });

    await jobRepo.markProcessingJobCompletedByBullId(String(job.id), QUEUE_NAMES.DOCUMENT_DOWNLOAD);
    return { documentId, objectKey: upload.objectKey, size: validation.fileSize, extractJobId: extractJob.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown PDF download error';
    await documentService.updateStatus(documentId, 'FAILED', message);
    await updateLinkedCseDocumentStatus(documentId, 'FAILED', message).catch(() => undefined);
    await jobRepo.markProcessingJobFailedByBullId(String(job.id), QUEUE_NAMES.DOCUMENT_DOWNLOAD, message);
    await createProcessingLog({ documentId, level: 'ERROR', message: 'PDF download failed', metadata: { error: message } });
    throw error;
  }
}

export function startDocumentDownloadWorker() {
  const worker = new Worker<DocumentDownloadJobData, unknown, string>(QUEUE_NAMES.DOCUMENT_DOWNLOAD, processDocumentDownload, {
    connection: redisConnectionOptions,
    concurrency: 2
  });

  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Document download job completed'));
  worker.on('failed', (job, error) => logger.error({ jobId: job?.id, error }, 'Document download job failed'));

  return worker;
}
