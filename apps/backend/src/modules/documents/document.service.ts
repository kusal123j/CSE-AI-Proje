import { AppError } from '../../middleware/errorHandler';
import { upperSymbol } from '../../utils/slugify';
import { findCompanyBySymbol } from '../companies/company.repository';
import { createProcessingLog, listLogsByDocument } from '../processingLogs/processingLog.repository';
import { addDocumentDownloadJob } from '../../queues/documentDownload.queue';
import { addPdfExtractJob } from '../../queues/pdfExtract.queue';
import * as repo from './document.repository';
import { CreateDocumentData, UpdateStorageData } from './document.repository';
import { DocumentStatus } from './document.types';

const DOWNLOAD_ALLOWED_STATUSES = new Set<DocumentStatus>(['DISCOVERED', 'FAILED']);
const EXTRACT_ALLOWED_STATUSES = new Set<DocumentStatus>(['STORED', 'FAILED']);

export const documentService = {
  async create(input: Omit<CreateDocumentData, 'companyId'>) {
    const symbol = upperSymbol(input.symbol);
    const company = await findCompanyBySymbol(symbol);
    if (!company) {
      throw new AppError(404, `Create company ${symbol} before adding documents`);
    }

    if (input.sourceUrl) {
      const duplicate = await repo.findDocumentBySourceUrl(input.sourceUrl);
      if (duplicate) {
        throw new AppError(409, 'Document already exists with this source URL', {
          duplicateId: duplicate.id,
          duplicateReason: 'SOURCE_URL'
        });
      }
    }

    const shouldCheckBusinessDuplicate = ['ANNUAL_REPORT', 'INTERIM_REPORT'].includes(input.documentType);
    if (shouldCheckBusinessDuplicate) {
      const businessDuplicate = await repo.findDocumentByBusinessKey({
        companyId: company.id,
        documentType: input.documentType,
        financialYear: input.financialYear,
        period: input.period
      });

      if (businessDuplicate) {
        throw new AppError(409, 'Document already exists for this company/type/year/period', {
          duplicateId: businessDuplicate.id,
          duplicateReason: 'BUSINESS_KEY'
        });
      }
    }

    const document = await repo.createDocument({ ...input, symbol, companyId: company.id });
    await createProcessingLog({
      documentId: document.id,
      level: 'INFO',
      message: 'Document metadata created',
      metadata: { symbol, documentType: input.documentType }
    });
    return document;
  },

  list(filters: { symbol?: string; status?: string; documentType?: string }) {
    return repo.listDocuments({
      ...filters,
      symbol: filters.symbol ? upperSymbol(filters.symbol) : undefined
    });
  },

  async get(id: string) {
    const document = await repo.findDocumentById(id);
    if (!document) throw new AppError(404, 'Document not found');
    return document;
  },

  async updateStatus(id: string, status: DocumentStatus, errorMessage?: string | null) {
    const document = await repo.updateDocumentStatus(id, status, errorMessage);
    if (!document) throw new AppError(404, 'Document not found');
    await createProcessingLog({
      documentId: id,
      level: status === 'FAILED' ? 'ERROR' : 'INFO',
      message: `Document status updated to ${status}`,
      metadata: { errorMessage }
    });
    return document;
  },

  async clearError(id: string) {
    const document = await repo.clearDocumentError(id);
    if (!document) throw new AppError(404, 'Document not found');
    return document;
  },

  async markDuplicate(id: string, duplicateOfDocumentId: string, reason: string) {
    const document = await repo.markDocumentDuplicate(id, duplicateOfDocumentId, reason);
    if (!document) throw new AppError(404, 'Document not found');
    await createProcessingLog({
      documentId: id,
      level: 'WARN',
      message: 'Document marked as duplicate',
      metadata: { duplicateOfDocumentId, reason }
    });
    return document;
  },

  findByChecksum(checksum: string) {
    return repo.findDocumentByChecksum(checksum);
  },

  async updateStorage(id: string, data: UpdateStorageData) {
    const document = await repo.updateDocumentStorage(id, data);
    if (!document) throw new AppError(404, 'Document not found');
    return document;
  },

  async pages(id: string) {
    await this.get(id);
    return repo.listDocumentPages(id);
  },

  async logs(id: string) {
    await this.get(id);
    return listLogsByDocument(id);
  },

  async queueDownload(id: string, options?: { forceRetry?: boolean }) {
    const document = await this.get(id);
    if (!document.source_url) {
      throw new AppError(400, 'Document source_url is required before download');
    }

    if (document.status === 'DUPLICATE') {
      throw new AppError(409, 'Duplicate documents cannot be downloaded', { documentId: id });
    }

    if (!DOWNLOAD_ALLOWED_STATUSES.has(document.status) && !options?.forceRetry) {
      throw new AppError(409, `Cannot queue download while document status is ${document.status}`);
    }

    await this.clearError(id);
    await this.updateStatus(id, 'DOWNLOADING');
    const job = await addDocumentDownloadJob({
      documentId: id,
      sourceUrl: document.source_url,
      symbol: document.symbol
    });

    return { documentId: id, bullmqJobId: job.id, queue: job.queueName };
  },

  async queueExtract(id: string, options?: { forceRetry?: boolean }) {
    const document = await this.get(id);
    if (document.status === 'DUPLICATE') {
      throw new AppError(409, 'Duplicate documents cannot be extracted', { documentId: id });
    }

    if (!document.minio_bucket || !document.minio_object_key) {
      throw new AppError(400, 'Document must be stored in MinIO before extraction');
    }

    if (!EXTRACT_ALLOWED_STATUSES.has(document.status) && !options?.forceRetry) {
      throw new AppError(409, `Cannot queue extraction while document status is ${document.status}`);
    }

    await this.clearError(id);
    await this.updateStatus(id, 'EXTRACTING');
    const job = await addPdfExtractJob({
      documentId: id,
      bucket: document.minio_bucket,
      objectKey: document.minio_object_key
    });

    return { documentId: id, bullmqJobId: job.id, queue: job.queueName };
  }
};
