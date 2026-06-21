import { AppError } from '../../middleware/errorHandler';
import { upperSymbol } from '../../utils/slugify';
import { findCompanyBySymbol } from '../companies/company.repository';
import { documentService } from '../documents/document.service';
import { DocumentType } from '../documents/document.types';
import { createProcessingLog } from '../processingLogs/processingLog.repository';
import { fetchDocumentsFromCse, CseDocumentCandidate } from './cseClient';

export const cseCollectorService = {
  async fetch(input: {
    symbol: string;
    documentType: DocumentType;
    autoQueueDownload?: boolean;
    documents?: Array<Omit<CseDocumentCandidate, 'documentType'>>;
  }) {
    const symbol = upperSymbol(input.symbol);
    const company = await findCompanyBySymbol(symbol);
    if (!company) {
      throw new AppError(404, `Create company ${symbol} before fetching documents`);
    }

    const usingManualDocuments = Boolean(input.documents?.length);
    const fetched = usingManualDocuments
      ? input.documents!.map((doc) => ({ ...doc, documentType: input.documentType }))
      : await fetchDocumentsFromCse(symbol, input.documentType);

    const result = {
      symbol,
      message:
        fetched.length === 0 && !usingManualDocuments
          ? 'CSE source adapter is not configured yet. Use manual documents or CSE_MOCK_MODE=true for foundation testing.'
          : 'CSE collector fetch completed',
      discovered: fetched.length,
      created: 0,
      skipped: 0,
      failed: 0,
      queuedDownloads: 0,
      documents: [] as unknown[],
      skippedDocuments: [] as unknown[]
    };

    for (const candidate of fetched) {
      try {
        const document = await documentService.create({
          symbol,
          documentType: candidate.documentType,
          title: candidate.title,
          sourceUrl: candidate.sourceUrl,
          sourceDocumentId: candidate.sourceDocumentId,
          financialYear: candidate.financialYear,
          period: candidate.period,
          publishedDate: candidate.publishedDate,
          fileName: candidate.fileName
        });

        result.created += 1;
        result.documents.push(document);

        if (input.autoQueueDownload) {
          await documentService.queueDownload(document.id);
          result.queuedDownloads += 1;
        }
      } catch (error) {
        if (error instanceof AppError && error.statusCode === 409) {
          result.skipped += 1;
          result.skippedDocuments.push({ title: candidate.title, reason: error.message, details: error.details });
          continue;
        }
        result.failed += 1;
        throw error;
      }
    }

    await createProcessingLog({
      level: 'INFO',
      message: 'CSE collector fetch completed',
      metadata: { symbol, documentType: input.documentType, result }
    });

    return result;
  }
};
